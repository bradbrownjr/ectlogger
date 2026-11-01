"""
Net and schedule logos: shared files, the library, and passing a new logo on.

Every net made from a schedule points at the schedule's logo file, so until
2026-11-01 removing or replacing a schedule's logo deleted or overwrote the
file under every past net from it. Logo files are now named after their
contents and deleted only when nothing points at them. Rules guarded here:

- replacing or removing a schedule's logo leaves its past nets' logo alone;
- the file goes once the last net or schedule stops using it;
- the library lists each image once, labelled with who uses it;
- applying a logo accepts only one already in use, and is all or nothing
  across the nets and schedules listed;
- "uses" lists only what the caller may change.
"""
from io import BytesIO

import pytest
from PIL import Image
from sqlalchemy import select

from app.models import Net, NetTemplate
from tests.conftest import auth_headers


@pytest.fixture(autouse=True)
def logo_dir(tmp_path, monkeypatch):
    import app.routers.nets_core as nets_core
    import app.routers.templates_core as templates_core
    import app.services.net_logos as net_logos
    for module in (nets_core, templates_core, net_logos):
        monkeypatch.setattr(module, "NET_LOGO_DIR", tmp_path)
    return tmp_path


def _png(color) -> bytes:
    buf = BytesIO()
    Image.new("RGB", (64, 64), color).save(buf, format="PNG")
    return buf.getvalue()


async def _upload(client, user, kind, entity_id, color):
    resp = await client.post(
        f"/api/{kind}/{entity_id}/logo",
        files={"file": ("logo.png", _png(color), "image/png")},
        headers=auth_headers(user),
    )
    assert resp.status_code == 200, resp.text
    return resp.json()["logo_url"]


async def _template(db, owner, name="SET schedule"):
    template = NetTemplate(name=name, owner_id=owner.id)
    db.add(template)
    await db.commit()
    await db.refresh(template)
    return template


async def _net(db, owner, name="SET", **kw):
    net = Net(name=name, owner_id=owner.id, status="closed", **kw)
    db.add(net)
    await db.commit()
    await db.refresh(net)
    return net


async def _logo(db, model, entity_id):
    return (await db.execute(
        select(model.logo_url).where(model.id == entity_id).execution_options(populate_existing=True)
    )).scalar_one()


def _file(logo_dir, url):
    return logo_dir / url.rsplit("/", 1)[1]


@pytest.mark.asyncio
async def test_replacing_a_schedule_logo_keeps_past_nets_logo(client, db, owner, logo_dir):
    template = await _template(db, owner)
    old = await _upload(client, owner, "templates", template.id, "red")
    net = await _net(db, owner, template_id=template.id, logo_url=old)

    new = await _upload(client, owner, "templates", template.id, "blue")

    assert new != old
    assert await _logo(db, Net, net.id) == old
    assert _file(logo_dir, old).exists()
    assert _file(logo_dir, new).exists()


@pytest.mark.asyncio
async def test_removing_a_logo_deletes_the_file_only_when_unused(client, db, owner, logo_dir):
    template = await _template(db, owner)
    url = await _upload(client, owner, "templates", template.id, "red")
    net = await _net(db, owner, template_id=template.id, logo_url=url)

    assert (await client.delete(f"/api/templates/{template.id}/logo", headers=auth_headers(owner))).status_code == 200
    assert _file(logo_dir, url).exists(), "the net still shows it"

    assert (await client.delete(f"/api/nets/{net.id}/logo", headers=auth_headers(owner))).status_code == 200
    assert not _file(logo_dir, url).exists()


@pytest.mark.asyncio
async def test_same_image_uploaded_twice_is_one_file(client, db, owner, logo_dir):
    a = await _net(db, owner, name="A")
    b = await _net(db, owner, name="B")
    url_a = await _upload(client, owner, "nets", a.id, "green")
    url_b = await _upload(client, owner, "nets", b.id, "green")
    assert url_a == url_b
    assert len(list(logo_dir.iterdir())) == 1


@pytest.mark.asyncio
async def test_library_lists_each_image_once_with_its_users(client, db, owner, other, logo_dir):
    template = await _template(db, other, name="WSSM MOTA")
    url = await _upload(client, other, "templates", template.id, "red")
    await _net(db, other, name="WSSM MOTA", template_id=template.id, logo_url=url)
    # A pre-2026-11-01 file holding the same image under its old name.
    legacy = logo_dir / "net-81.png"
    legacy.write_bytes(_file(logo_dir, url).read_bytes())
    await _net(db, other, name="Old net", logo_url="/api/net-logos/net-81.png")
    # A row whose file is gone is not offered.
    await _net(db, other, name="Broken", logo_url="/api/net-logos/missing.png")

    resp = await client.get("/api/logos", headers=auth_headers(owner))
    assert resp.status_code == 200
    entries = resp.json()
    assert len(entries) == 1
    assert entries[0]["used_by"][0] == "WSSM MOTA"
    assert "Old net" in entries[0]["used_by"]


@pytest.mark.asyncio
async def test_library_needs_sign_in(client):
    assert (await client.get("/api/logos")).status_code in (401, 403)


@pytest.mark.asyncio
async def test_choose_a_logo_from_someone_elses_schedule(client, db, owner, other, logo_dir):
    template = await _template(db, other, name="WSSM MOTA")
    url = await _upload(client, other, "templates", template.id, "red")
    net = await _net(db, owner)

    resp = await client.post("/api/logos/apply", json={"logo_url": url, "net_ids": [net.id]},
                             headers=auth_headers(owner))
    assert resp.status_code == 200, resp.text
    assert await _logo(db, Net, net.id) == url

    # Their schedule can change its logo without touching this net's.
    await _upload(client, other, "templates", template.id, "blue")
    assert await _logo(db, Net, net.id) == url
    assert _file(logo_dir, url).exists()


@pytest.mark.asyncio
async def test_apply_refuses_a_logo_nothing_uses(client, db, owner, logo_dir):
    net = await _net(db, owner)
    (logo_dir / "stray.png").write_bytes(_png("red"))
    for bad in ("/api/net-logos/stray.png", "/api/net-logos/../secret.png", "https://example.com/x.png"):
        resp = await client.post("/api/logos/apply", json={"logo_url": bad, "net_ids": [net.id]},
                                 headers=auth_headers(owner))
        assert resp.status_code == 400, bad
    assert await _logo(db, Net, net.id) is None


@pytest.mark.asyncio
async def test_apply_is_all_or_nothing(client, db, owner, other, logo_dir):
    mine = await _net(db, owner, name="Mine")
    theirs = await _net(db, other, name="Theirs")
    url = await _upload(client, owner, "nets", mine.id, "red")
    spare = await _net(db, owner, name="Spare")

    resp = await client.post("/api/logos/apply", json={"logo_url": url, "net_ids": [spare.id, theirs.id]},
                             headers=auth_headers(owner))
    assert resp.status_code == 403
    assert await _logo(db, Net, spare.id) is None
    assert await _logo(db, Net, theirs.id) is None


@pytest.mark.asyncio
async def test_pass_a_new_logo_on_to_the_others(client, db, owner, other, logo_dir):
    template = await _template(db, owner)
    old = await _upload(client, owner, "templates", template.id, "red")
    past = await _net(db, owner, name="Past", template_id=template.id, logo_url=old)
    not_mine = await _net(db, other, name="Not mine", logo_url=old)
    new = await _upload(client, owner, "templates", template.id, "blue")

    uses = await client.get("/api/logos/uses", params={"logo_url": old, "exclude_schedule_id": template.id},
                            headers=auth_headers(owner))
    assert uses.status_code == 200
    assert [n["name"] for n in uses.json()["nets"]] == ["Past"]
    assert uses.json()["schedules"] == []

    resp = await client.post("/api/logos/apply", json={"logo_url": new, "net_ids": [past.id]},
                             headers=auth_headers(owner))
    assert resp.status_code == 200
    assert await _logo(db, Net, past.id) == new
    assert _file(logo_dir, old).exists(), "another manager's net still shows it"

    await client.delete(f"/api/nets/{not_mine.id}/logo", headers=auth_headers(other))
    assert not _file(logo_dir, old).exists()

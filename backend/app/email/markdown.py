"""
Markdown to safe HTML for email: the schedule's announcements and a net's
notes in the closing email.

Rendered with markdown-it-py (CommonMark, https://markdown-it-py.readthedocs.io)
with tables and strikethrough on and single line breaks kept, to match the
app's react-markdown + remark-gfm + remark-breaks rendering of the same text.
Raw HTML in the Markdown is escaped, not passed through (html=False), and
markdown-it's own link check already refuses javascript:, vbscript:, file:
and data: links.

The result is then cleaned by nh3 (Rust ammonia bindings,
https://nh3.readthedocs.io) to a short allowlist suited to email: no images
(remote images are tracking pixels and are blocked by most mail clients
anyway), no scripts, styles, iframes or event attributes, and links only to
http, https and mailto. A relative link would be broken in an email, so it is
stripped too.
"""
import nh3
from markdown_it import MarkdownIt
from markdown_it.common.utils import escapeHtml
from markupsafe import Markup

ALLOWED_TAGS = {
    "h1", "h2", "h3", "h4", "h5", "h6", "p", "br", "hr",
    "ul", "ol", "li", "blockquote", "pre", "code",
    "strong", "em", "b", "i", "s", "del", "a",
    "table", "thead", "tbody", "tr", "th", "td",
}
ALLOWED_ATTRIBUTES = {
    "a": {"href", "title"},
    "ol": {"start"},
    "th": {"align"},
    "td": {"align"},
}
ALLOWED_URL_SCHEMES = {"http", "https", "mailto"}

_md = (
    MarkdownIt("commonmark", {"html": False, "breaks": True})
    .enable(["table", "strikethrough"])
)


def _image_as_link(self, tokens, idx, options, env):
    """An image becomes a link to it, labelled with its alt text, so the
    reader still learns it is there without the email loading it."""
    token = tokens[idx]
    alt = escapeHtml(self.renderInlineAsText(token.children or [], options, env) or "image")
    src = token.attrGet("src")
    return f'<a href="{escapeHtml(src)}">{alt}</a>' if src else alt


_md.add_render_rule("image", _image_as_link)


def markdown_to_email_html(text: str) -> Markup:
    """Safe HTML for *text*, ready to drop into a Jinja template."""
    if not text or not text.strip():
        return Markup("")
    rendered = _md.render(text)
    cleaned = nh3.clean(
        rendered,
        tags=ALLOWED_TAGS,
        attributes=ALLOWED_ATTRIBUTES,
        url_schemes=ALLOWED_URL_SCHEMES,
        url_relative="deny",
        link_rel="noopener noreferrer",
        # Tags whose content goes too, not only the tag. Defense in depth:
        # html=False already escapes any of these typed into the Markdown.
        clean_content_tags={"script", "style", "iframe", "object", "embed", "template"},
    )
    return Markup(cleaned)

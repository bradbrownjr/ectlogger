"""Guards on the application startup path.

These exist because a change once inserted a function between
@asynccontextmanager and lifespan(), silently moving the decorator onto the
wrong function. The backend then could not boot at all -- yet all 269 other
tests passed, because they build the app object and call routes directly and
none of them touch the startup path. It was only caught on deploy.

Running the real lifespan here isn't possible: it calls init_db(), which
performs schema setup against a database the test fixtures don't provision.
So instead these assert the properties that actually broke.
"""

import inspect

import pytest

from app.main import _load_gravatar_setting, lifespan
from app import utils


def test_startup_helper_is_a_plain_coroutine_not_a_context_manager():
    # The regression: @asynccontextmanager landed on this function, so calling
    # it returned an _AsyncGeneratorContextManager and `await` blew up at boot.
    assert inspect.iscoroutinefunction(_load_gravatar_setting), (
        "_load_gravatar_setting must be a plain async function. If a decorator "
        "has attached to it, lifespan() has lost its @asynccontextmanager and "
        "the app will not start."
    )


def test_lifespan_is_still_an_async_context_manager():
    # The other half of the same mistake: lifespan must remain decorated, since
    # FastAPI enters it as a context manager.
    assert hasattr(lifespan, "__wrapped__"), (
        "lifespan() appears undecorated -- @asynccontextmanager may have been "
        "displaced onto a function defined above it."
    )
    assert inspect.isasyncgenfunction(lifespan.__wrapped__)


@pytest.mark.asyncio
async def test_gravatar_setting_load_is_awaitable_and_applies_the_value():
    class Row:
        gravatar_enabled = False

    class Result:
        def scalar_one_or_none(self):
            return Row()

    class Session:
        async def execute(self, *_args, **_kwargs):
            return Result()

    original = utils.gravatar_is_enabled()
    try:
        utils.set_gravatar_enabled(True)
        await _load_gravatar_setting(Session())
        assert utils.gravatar_is_enabled() is False
    finally:
        utils.set_gravatar_enabled(original)


@pytest.mark.asyncio
async def test_gravatar_setting_survives_a_database_without_the_column():
    """An instance that hasn't run migration 058 must still boot."""
    class ExplodingSession:
        async def execute(self, *_args, **_kwargs):
            raise RuntimeError("no such column: gravatar_enabled")

    original = utils.gravatar_is_enabled()
    try:
        utils.set_gravatar_enabled(True)
        await _load_gravatar_setting(ExplodingSession())  # must not raise
        assert utils.gravatar_is_enabled() is True
    finally:
        utils.set_gravatar_enabled(original)

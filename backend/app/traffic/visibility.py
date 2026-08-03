"""
SQL WHERE-clause form of check_form_permission's "view" grant, for list
endpoints. See TRAFFIC-HANDLING-DESIGN.md D3: "list endpoints must apply the
visibility rule as a WHERE clause, not as a post-fetch filter, or pagination
counts leak the existence of traffic the caller cannot see."

check_form_permission (app/permissions.py) answers "can this user view this
one form" by loading the form's log entries and net and checking them in
Python. That is the right shape for a single-row permission check but cannot
be reused directly on a list query without an N+1 per candidate row. This
module expresses the same view-grant rules (submitter, current holder, chain
of custody, that net's NCS/logger, admin) as a single SQLAlchemy boolean
expression using correlated EXISTS subqueries, so it composes into one query
alongside the caller's other filters (q, form_type, precedence, ...) and one
COUNT for pagination's total.

Global admins are not included in this expression -- callers should skip
applying it entirely when is_admin(user) is True (admins see everything),
matching how routers/traffic_forms.py uses it.
"""
from __future__ import annotations

from sqlalchemy import exists, or_, select
from sqlalchemy.sql.elements import ColumnElement

from app.models import Form, Net, NetRole, TrafficLogEntry, User


def form_visibility_clause(user: User) -> ColumnElement:
    """A boolean SQL expression: True for Form rows *user* may view.

    Does not itself check is_admin -- see module docstring.
    """
    chain_of_custody = exists(
        select(TrafficLogEntry.id).where(
            TrafficLogEntry.form_id == Form.id,
            or_(
                TrafficLogEntry.reported_by_user_id == user.id,
                TrafficLogEntry.handed_to_user_id == user.id,
            ),
        )
    )

    # Mirrors check_net_permission(required_roles=["ncs", "logger"]): the net
    # owner, or a user holding one of those NetRoles on this form's net.
    net_ncs_or_logger = exists(
        select(Net.id).where(
            Net.id == Form.net_id,
            or_(
                Net.owner_id == user.id,
                exists(
                    select(NetRole.id).where(
                        NetRole.net_id == Net.id,
                        NetRole.user_id == user.id,
                        NetRole.role.in_(["ncs", "logger"]),
                    )
                ),
            ),
        )
    )

    return or_(
        Form.created_by_id == user.id,
        Form.held_by_user_id == user.id,
        chain_of_custody,
        net_ncs_or_logger,
    )

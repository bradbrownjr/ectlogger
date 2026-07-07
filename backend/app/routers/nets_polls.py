from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy import select, func

from app.database import get_db
from app.models import CheckIn, Net

router = APIRouter()

@router.get("/{net_id}/poll-responses")
async def get_poll_responses(
    net_id: int,
    db: AsyncSession = Depends(get_db)
):
    """Get unique poll responses for autocomplete during check-in"""
    result = await db.execute(
        select(Net).where(Net.id == net_id)
    )
    net = result.scalar_one_or_none()
    
    if not net:
        raise HTTPException(status_code=404, detail="Net not found")
    
    if not net.poll_enabled:
        return []
    
    # Get distinct poll responses from check-ins
    result = await db.execute(
        select(CheckIn.poll_response)
        .where(CheckIn.net_id == net_id, CheckIn.poll_response.isnot(None), CheckIn.poll_response != '')
        .distinct()
        .order_by(CheckIn.poll_response)
    )
    responses = [row[0] for row in result.fetchall()]
    return responses


@router.get("/{net_id}/poll-results")
async def get_poll_results(
    net_id: int,
    db: AsyncSession = Depends(get_db)
):
    """Get poll results with response counts for display/charting"""
    result = await db.execute(
        select(Net).where(Net.id == net_id)
    )
    net = result.scalar_one_or_none()
    
    if not net:
        raise HTTPException(status_code=404, detail="Net not found")
    
    if not net.poll_enabled:
        return {"question": None, "results": []}
    
    # Get poll responses with counts
    result = await db.execute(
        select(CheckIn.poll_response, func.count(CheckIn.id).label('count'))
        .where(CheckIn.net_id == net_id, CheckIn.poll_response.isnot(None), CheckIn.poll_response != '')
        .group_by(CheckIn.poll_response)
        .order_by(func.count(CheckIn.id).desc())
    )
    results = [{"response": row[0], "count": row[1]} for row in result.fetchall()]
    
    return {
        "question": net.poll_question,
        "results": results
    }


@router.get("/{net_id}/topic-responses")
async def get_topic_responses(
    net_id: int,
    db: AsyncSession = Depends(get_db)
):
    """Get topic of the week responses with callsigns for display/export"""
    result = await db.execute(
        select(Net).where(Net.id == net_id)
    )
    net = result.scalar_one_or_none()
    
    if not net:
        raise HTTPException(status_code=404, detail="Net not found")
    
    if not net.topic_of_week_enabled:
        return {"prompt": None, "responses": []}
    
    # Get topic responses with callsigns
    result = await db.execute(
        select(CheckIn.callsign, CheckIn.name, CheckIn.topic_response)
        .where(CheckIn.net_id == net_id, CheckIn.topic_response.isnot(None), CheckIn.topic_response != '')
        .order_by(CheckIn.checked_in_at)
    )
    responses = [{"callsign": row[0], "name": row[1], "response": row[2]} for row in result.fetchall()]
    
    return {
        "prompt": net.topic_of_week_prompt,
        "responses": responses
    }



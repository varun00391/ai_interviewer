from fastapi import APIRouter, Depends
from sqlalchemy.orm import Session

from app.database import get_db
from app.deps import get_current_user
from app.models import User
from app.schemas import SubscriptionActivate, UserMeOut
from app.services.subscription import apply_new_subscription, user_me_payload

router = APIRouter(prefix="/subscriptions", tags=["subscriptions"])


@router.post("/activate", response_model=UserMeOut)
def activate_mock(
    body: SubscriptionActivate,
    db: Session = Depends(get_db),
    user: User = Depends(get_current_user),
):
    """
    Demo activation: starts a 30-day paid window without a real payment processor.
    """
    apply_new_subscription(user, body.tier)
    db.commit()
    db.refresh(user)
    return user_me_payload(user, db)

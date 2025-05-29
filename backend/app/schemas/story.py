# backend/app/schemas/story.py
from pydantic import BaseModel
from typing import Dict, List, Optional

class Choice(BaseModel):
    id: str
    description: str

class StoryRequest(BaseModel):
    prompt: str
    previous_response_id: str | None = None

class StoryResponse(BaseModel):
    text: str
    choices: List[Choice]
    response_id: str
    image_url: Optional[str] = None
    image_bytes: Optional[bytes] = None

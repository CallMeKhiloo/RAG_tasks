from pydantic import BaseModel
from typing import List

class RecipeStep(BaseModel):
    step_number: int
    instruction: str
    chef_comment: str
    is_final_step: bool

class ChefRequest(BaseModel):
    message: str
    thread_id: str  # To keep memory alive
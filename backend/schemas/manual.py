from pydantic import BaseModel
from typing import List, Optional, Any, Dict

class ForceAnswerRequest(BaseModel):
    working_dir: str
    student_id: str
    question: int
    given_answers: str

class ForceAnswersRequest(BaseModel):
    working_dir: str
    student_id: str
    answers_list: List[str]  # e.g. ["AC", "B", "", "D"]

from pydantic import BaseModel
from typing import List

class StudentAssociation(BaseModel):
    original_id: str
    new_student_id: str
    new_fullname: str

class BulkAssociateRequest(BaseModel):
    working_dir: str
    associations: List[StudentAssociation]

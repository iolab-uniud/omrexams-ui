from pydantic import BaseModel

from typing import Optional

class CalculateRequest(BaseModel):
    working_dir: str
    outputfile: str
    use_custom_weights: Optional[bool] = False
    weight_correct: Optional[float] = 1.0
    weight_wrong: Optional[float] = -0.33
    weight_missing: Optional[float] = 0.0

class ReportRequest(BaseModel):
    working_dir: str
    outputfile: str

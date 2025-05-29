from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware
from app.api.v1.endpoints.story import router as story_router

app = FastAPI(title="Story API", description="인터랙티브 스토리 생성 API")

# CORS 설정
app.add_middleware(
    CORSMiddleware,
    allow_origins=["http://localhost:3000"],  # 프로덕션에서는 실제 프론트엔드 도메인으로 제한해야 함
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

# API 라우터 연결
app.include_router(story_router, prefix="/api/v1/story", tags=["story"])

@app.get("/")
def root():
    return {"msg": "Hello, Story!", "version": "1.0.0"}

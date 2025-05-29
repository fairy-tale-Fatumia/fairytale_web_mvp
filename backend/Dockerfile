# story_mvp/backend/Dockerfile

FROM python:3.11-slim

# 1) 작업 디렉터리 설정
WORKDIR /code

# 2) 컨텍스트 루트(backend/)의 requirements.txt 복사
COPY requirements.txt .

# 3) 의존성 설치
RUN pip install --no-cache-dir -r requirements.txt

# 4) 컨텍스트 루트의 app 폴더 전체 복사
COPY app /code/app

# 5) FastAPI 서버 실행
CMD ["uvicorn", "app.main:app", "--host", "0.0.0.0", "--port", "8000"]

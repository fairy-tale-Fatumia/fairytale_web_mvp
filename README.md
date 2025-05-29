# AI 동화 이야기 프로젝트

인터랙티브한 AI 동화 이야기 웹 애플리케이션입니다. 사용자가 주제를 입력하면 AI가 동화를 생성하고, 선택지를 통해 이야기를 진행할 수 있습니다. 각 스토리에는 gpt-image-1으로 생성된 이미지가 함께 제공됩니다.

## 시작하기

프로젝트를 실행하기 위한 두 가지 방법이 있습니다:

1. 직접 실행 (개발 환경)
2. Docker Compose 사용 (권장)

### 필수 요구사항

- Node.js 19+ (프론트엔드)
- Python 3.11+ (백엔드)
- Docker 및 Docker Compose (도커 실행 시)
- OpenAI API 키

## 1. 직접 실행 (개발 환경)

### 백엔드 실행

1. 백엔드 디렉토리로 이동:
```bash
cd backend
```

2. 가상환경 생성 및 활성화 (선택사항):
```bash
python -m venv venv
source venv/bin/activate  # Linux/macOS
# 또는
venv\Scripts\activate     # Windows
```

3. 종속성 설치:
```bash
pip install -r requirements.txt
```

4. 환경 변수 설정:
```bash
# .env 파일 생성 또는 직접 환경 변수 설정
echo "OPENAI_API_KEY=your_openai_api_key_here" > .env
```

5. 개발 서버 실행:
```bash
python -m uvicorn app.main:app --reload
```

백엔드 서버는 기본적으로 http://localhost:8000 에서 실행됩니다.

### 프론트엔드 실행

1. 프론트엔드 디렉토리로 이동:
```bash
cd frontend
```

2. 종속성 설치:
```bash
npm install
```

3. 환경 변수 설정 (선택사항):
```bash
# .env.local 파일 생성
echo "NEXT_PUBLIC_API_URL=http://localhost:8000" > .env.local
```

4. 개발 서버 실행:
```bash
npm run dev
```

프론트엔드는 기본적으로 http://localhost:3000 에서 실행됩니다.

## 2. Docker Compose 실행 (권장)

Docker Compose를 사용하면 한 번에 모든 서비스를 실행할 수 있습니다.

1. 환경 변수 설정:
```bash
# 프로젝트 루트에 .env 파일 생성
echo "OPENAI_API_KEY=your_openai_api_key_here" > .env
```

2. Docker Compose로 서비스 실행:
```bash
# 기본 실행
docker-compose -f docker-compose.min.yml up

# 백그라운드 실행
docker-compose -f docker-compose.min.yml up -d

# 이미지 재빌드 (코드 변경 시)
docker-compose -f docker-compose.min.yml down
docker-compose -f docker-compose.min.yml build --no-cache backend
docker-compose -f docker-compose.min.yml up -d
```

3. 로그 확인 (백그라운드 실행 시):
```bash
docker-compose -f docker-compose.min.yml logs -f
```

## 프로젝트 구조

```
fairytale_web_mvp/
├── backend/                    # 백엔드 (FastAPI)
│   ├── app/                    # 백엔드 애플리케이션
│   │   ├── api/                # API 엔드포인트
│   │   │   └── v1/endpoints/   # API 버전 1 엔드포인트
│   │   │       └── story.py    # 스토리 API
│   │   ├── core/               # 핵심 설정
│   │   ├── prompts/            # AI 프롬프트 템플릿
│   │   │   └── story_prompt.txt # 스토리 생성 프롬프트
│   │   ├── schemas/            # Pydantic 모델
│   │   │   └── story.py        # 스토리 스키마
│   │   ├── services/           # 비즈니스 로직
│   │   │   ├── dalle_gen_img.py # 이미지 생성 서비스
│   │   │   └── llm_service.py   # LLM 서비스
│   │   └── main.py             # FastAPI 메인 앱
│   ├── Dockerfile              # 백엔드 도커 설정
│   └── requirements.txt        # 파이썬 의존성
│
├── frontend/                   # 프론트엔드 (Next.js)
│   ├── src/                    # 소스 코드
│   │   └── app/                # Next.js 앱
│   │       ├── components/     # 리액트 컴포넌트
│   │       │   └── StoryChat.tsx # 메인 채팅 컴포넌트
│   │       ├── globals.css     # 전역 CSS
│   │       ├── layout.tsx      # 레이아웃 컴포넌트
│   │       └── page.tsx        # 메인 페이지
│   ├── public/                 # 정적 파일
│   ├── package.json            # npm 패키지 설정
│   └── tailwind.config.js      # Tailwind CSS 설정
│
└── docker-compose.min.yml      # Docker Compose 설정
```

## API 문서

백엔드 API 문서는 다음 URL에서 확인할 수 있습니다:
- Swagger UI: http://localhost:8000/docs
- ReDoc: http://localhost:8000/redoc

## 주요 기능

- 동화 이야기 생성
- 선택지를 통한 이야기 진행
- 이야기에 맞는 이미지 생성 (DALL-E)
- 모바일 환경 지원

## 문제 해결

### Docker 관련 문제

만약 Docker 실행 중 문제가 발생한다면:

```bash
# 모든 컨테이너 중지 및 제거
docker-compose -f docker-compose.min.yml down

# 캐시 없이 이미지 재빌드
docker-compose -f docker-compose.min.yml build --no-cache

# 다시 시작
docker-compose -f docker-compose.min.yml up
```

### 백엔드 API 통신 문제

API 통신 오류가 발생하면:

1. 백엔드 서버가 실행 중인지 확인:
```bash
curl http://localhost:8000
```

2. 백엔드 로그 확인:
```bash
# 직접 실행 시 터미널 로그 확인
# Docker 실행 시
docker-compose -f docker-compose.min.yml logs -f backend
```

3. OpenAI API 키가 올바르게 설정되었는지 확인
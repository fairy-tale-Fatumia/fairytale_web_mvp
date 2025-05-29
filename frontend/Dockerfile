# frontend/Dockerfile

# 빌드 단계: 소스 코드를 빌드하여 정적 파일 생성
FROM node:20-alpine AS builder

# 작업 디렉터리 설정
WORKDIR /app

# 의존성 파일 복사
COPY package.json package-lock.json* ./

# 의존성 설치
RUN npm ci

# 소스 코드 복사
COPY . .

# Next.js 애플리케이션 빌드
RUN npm run build

# 실행 단계: 빌드된 애플리케이션만 포함한 가벼운 이미지
FROM node:20-alpine AS runner

WORKDIR /app

# 프로덕션 환경으로 설정
ENV NODE_ENV=production

# 필요한 파일만 복사
COPY --from=builder /app/public ./public
COPY --from=builder /app/.next ./.next
COPY --from=builder /app/node_modules ./node_modules
COPY --from=builder /app/package.json ./package.json

# 애플리케이션 실행
CMD ["npm", "start"] 
# FORME — AI 가상 스타일링

HTML/CSS/JavaScript + Express 5 + OpenAI 이미지 편집 API입니다. 기존 사진의 옷차림을 선택한 스타일로 편집하고, 원본 비교·원본 기반 재생성·JPEG 다운로드를 제공합니다.

## 실행

Node.js 22 이상, PowerShell 기준:

```powershell
npm.cmd install
npm.cmd run dev
```

http://localhost:3000 에 접속하세요. 일반 실행은 `npm.cmd start`입니다. 기존 서버가 실행 중이라면 종료하고 다시 시작하세요. 이미 있는 `.env`는 수정하지 않았습니다. 다른 셸에서는 `npm`도 사용할 수 있습니다.

- `OPENAI_API_KEY`: 기존 `.env` 또는 서버 환경변수에서만 읽습니다.
- `PORT`: 로컬 포트, 기본값 3000.

사진·스타일·추가 요청을 선택한 뒤 **스타일링 생성**을 누르세요. 예시 사진도 실제 AI 편집을 요청합니다. 생성·재생성은 유료 API 요청이며 자동 재시도나 다른 모델로의 자동 전환은 하지 않습니다.

## 모델 및 정확한 호출 방식

2026-11-03 공식 문서 확인:

- [`gpt-image-2.5-sunburst`](https://developers.openai.com/api/docs/models/gpt-image-2.5-sunburst)는 이미지 생성과 **편집**을 지원합니다. 요청한 모델 ID를 그대로 사용합니다.
- [이미지 편집 API](https://developers.openai.com/api/reference/resources/images/methods/edit): `POST https://api.openai.com/v1/images/edits`, `Authorization: Bearer <서버 환경변수>`.
- Node 내장 `fetch`와 `FormData`로 `image[]`에 원본 파일을 첨부합니다. `Content-Type`은 FormData가 boundary와 함께 설정하므로 직접 지정하지 않습니다.
- 전송 필드: `model=gpt-image-2.5-sunburst`, `prompt`, `n=1`, `size=auto`, `quality=medium`, `output_format=jpeg`, `output_compression=85`.
- 응답의 `data[0].b64_json`을 서버에서 디코딩·검증합니다. Sunburst에서 지원이 명시되지 않은 `input_fidelity`나 레거시 `response_format`은 보내지 않습니다.

문서상 지원과 계정 권한은 다릅니다. 모델 접근 제한, 조직 인증, 결제·할당량에 따라 호출이 거부될 수 있습니다. 읽기 전용 확인:

```powershell
npm.cmd run check:model
```

이 명령은 모델 조회만 수행하며 이미지 생성은 요청하지 않습니다. 조회 성공도 실제 편집 품질이나 결제 가능 여부까지 보장하지는 않습니다.

## 편집과 결과 확인

`src/styling.js`에 스타일별 의상 지시문이 있습니다.

| 스타일 | 편집 지시 |
| --- | --- |
| 캐주얼 | 편안한 상의·니트, 데님·치노, 자연스러운 중성색 |
| 비즈니스 | 테일러드 재킷, 셔츠·블라우스, 정돈된 하의와 구두 |
| 스트리트 | 레이어링, 후디·재킷, 카고·와이드 데님, 스니커즈 |
| 빈티지 | 클래식 재킷·니트, 하이웨이스트, 따뜻한 복고 색감 |

공통 프롬프트는 얼굴·정체성·표정·머리·체형·포즈·손·배경·조명·구도를 유지하고 옷차림만 바꾸도록 요청합니다. 추가 요청은 이 범위의 의상 선호로 전달합니다. 프롬프트는 보존을 유도하지만 보존을 보장하는 마스크나 자동 품질 판정은 아닙니다.

얼굴·손·포즈·의상 디테일을 원본과 비교해 확인하세요. **다시 생성**은 현재 원본 파일과 현재 선택한 스타일·요청을 다시 전송합니다. 직전 AI 결과를 입력으로 사용하지 않습니다. 실패하면 직전 결과를 유지합니다. 새 원본을 선택하면 이전 결과와 다운로드 상태를 초기화합니다.

화면의 진행률은 처리 단계 표시이며 실제 모델의 진행률이 아닙니다. 서버 요청은 최대 240초, 브라우저는 최대 270초를 기다립니다. 시간 초과가 발생해도 이전 요청이 OpenAI에서 처리되었을 수 있으므로 재요청은 추가 비용을 유발할 수 있습니다.

## 앱 API

`POST /api/style` — `multipart/form-data`

| 필드 | 내용 |
| --- | --- |
| image | 필수, JPG/JPEG/PNG/WEBP 한 장, 최대 4MiB |
| style | casual / business / street / vintage |
| prompt | 선택, 최대 500자 문자열 |

확장자·MIME·실제 디코딩 형식을 검사하며 빈 파일·손상·애니메이션·4천만 픽셀 초과·중복/알 수 없는 필드를 거부합니다. 검증 후 원본과 프롬프트를 OpenAI로 전송합니다. 앱 서버에는 업로드나 결과를 파일로 저장하지 않습니다. OpenAI 측 데이터 처리는 [공식 데이터 정책](https://developers.openai.com/api/docs/guides/your-data)을 확인하세요.

성공 응답은 `image/jpeg` 바이너리이며 `X-Styling-Model`과 `Content-Disposition` 헤더가 포함됩니다. 결과는 최대 1536×1536 범위 안에서 비율을 유지하고 JPEG로 저장하며 4MiB를 넘지 않도록 검증합니다. 브라우저는 Blob URL로 표시·다운로드합니다. JSON의 `imageUrl`을 반환하던 데모 계약은 대체되었습니다.

오류: `{ "error": { "code": "...", "message": "..." } }`

| 상황 | 상태 / 코드 |
| --- | --- |
| 잘못된 입력·파일 | 400 |
| 용량 초과 | 413 |
| multipart가 아님 | 415 |
| 키 없음·인증 실패 | 503 / OPENAI_NOT_CONFIGURED, OPENAI_AUTH_ERROR |
| 모델 접근 불가 | 503 / OPENAI_MODEL_UNAVAILABLE |
| 사용 한도·요청 제한 | 429 / OPENAI_RATE_LIMIT |
| 편집 요청 거절 | 422 / EDIT_REJECTED |
| 서버·연결·이미지 결과 오류 | 502 |
| 편집 시간 초과 | 504 / OPENAI_TIMEOUT |

API 키나 OpenAI 오류 원문은 반환하거나 기록하지 않습니다. `GET /api/health`는 앱 모드와 모델 ID, 파일 제한을 반환하며 외부 API를 호출하지 않습니다.

## 테스트

```powershell
npm.cmd test
npm.cmd run check
npm.cmd run check:model
```

자동 테스트는 테스트용 키와 이미지 응답을 사용하는 HTTP 경계 대역을 주입합니다. 실제 OpenAI 편집 호출이나 비용 없이 multipart 전달·스타일별 프롬프트·오류 변환·이미지 디코딩·업로드 검증·비공개 파일 차단과 프론트엔드 생성·재생성·다운로드 흐름을 확인합니다. 프론트엔드 테스트는 DOM 대역을 사용하며 실제 브라우저 렌더링 검증은 아닙니다.

실제 API 수동 테스트는 서버 실행 후 본인에게 사용 권한이 있는 이미지 경로로 변경하세요. 아래 요청은 유료 이미지 편집을 실행합니다.

```powershell
curl.exe --fail-with-body -F "image=@C:/path/to/photo.jpg" -F "style=casual" -F "prompt=navy knitwear" http://localhost:3000/api/style --output result.jpg
```

브라우저에서는 업로드 → 생성 → 원본 비교 → 다시 생성 → 이미지 저장을 확인하세요. 외부 이미지와 웹 폰트는 인터넷 연결이 필요합니다.

## 비밀 정보와 GitHub

- `.env`와 `.env.*`는 `.gitignore`, `.vercelignore`로 제외합니다. `.env.example`에는 키 값이 없습니다.
- Express는 `public/`만 공개하므로 `.env`, 서버 소스와 테스트 파일을 다운로드할 수 없습니다.
- 프론트엔드에는 키나 인증 헤더를 넣지 않으며 같은 출처의 `/api/style`만 호출합니다.
- `.env`는 커밋 대상에서 제외합니다. 이미 추적된 파일은 ignore 규칙만으로 제외되지 않으므로 향후 변경에서도 `.env`가 추적 대상에 없는지 확인하세요.

## Vercel

`src/app.js`의 Express 기본 내보내기와 `public/` 구조를 사용합니다. 배포는 실행하지 않았습니다. 키는 Vercel 서버 환경변수로 등록하세요. Vercel의 함수 요청·응답 제한은 4.5MB이므로 앱의 입력·출력을 4MiB로 제한합니다. [Vercel Functions 제한](https://vercel.com/docs/functions/limitations)을 확인하고, 실제 편집 시간에 맞는 함수 실행 시간을 플랜 범위 내에서 설정해야 합니다. 장시간 편집을 보장하려면 추후 작업 큐·외부 스토리지·상태 조회 방식이 필요합니다. 인증과 사용자별 사용량 제한은 현재 범위에 포함되지 않았으므로 공개 서비스로 운영할 때 추가하세요.

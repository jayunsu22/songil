# songil — 세션 공통 메모

## 노트북 카톡 프로그램(kakao_reader) 업데이트 파일
- 여러 세션이 kakao_reader 를 고친다. 다른 세션은 `kakao-reader` 가지에 올린다 (2026-11-13 사장님이 두 세션 것을 합친 zip 을 보내 확인함).
- 업데이트 zip 을 만들기 전에 꼭 `git fetch origin` 후 `origin/kakao-reader` 와 `origin/main` 을 지금 가지에 합친다 — 한쪽 것만 묶으면 다른 세션 기능(사장님 말투 tone.py, 뜻 모르면 답장 안 함 등)이 노트북에서 빠진다.
- zip: `kakao_reader/` 폴더째, test_*.py · __pycache__ · config.json 은 빼고, `version.txt` 첫 줄을 날짜_시각(예 1113_1233)으로 올린다. 파일 이름 `kakao_reader_YYYYMMDD_HHMM_pc.zip`.
- test_assist/autoread/chatlist/kakao_window/reader 는 윈도우(ctypes.windll) 전용이라 리눅스에서 실패하는 게 정상.

## n8n
- `n8n/*/workflow.json` 은 `node n8n/<이름>/build.js > n8n/<이름>/workflow.json` 로 만든다. 합칠 때 충돌나면 build.js 로 다시 만든다.
- 살아 있는 n8n 코드가 저장소와 다를 수 있다 — 고치기 전에 살아 있는 것을 읽는다.

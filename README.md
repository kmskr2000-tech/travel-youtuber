# 여행유튜버로 성공하기

웹(HTML5) 여행 유튜버 시뮬레이션. 설계서: `~/workspace/goals/goal-12/files/설계서.md` (v0.2)

- 빌드 도구 없음. 정적 파일 그대로 GitHub Pages 배포 예정.
- `npm test` 대신 `node --test test/*.test.mjs`
- 밸런스 시뮬: `node tools/sim.mjs --n 100 [--set conversion=0.10]`
- 수치: `data/balance.json` (핵심 수치 변경은 승인 후)

현재: M4 완료 (카드 플래너·촬영 진행/이벤트 선택·편집·유튜브식 결과 화면, 한 판 풀 플레이 가능). 실행: 정적 서버로 index.html 서빙 (예: python3 -m http.server).

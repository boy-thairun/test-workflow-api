# แผน TDD สำหรับ API ห้องเสมือน

สถานะร่างเพื่อรีวิว · ผู้ใช้ที่ล็อกอินทุกคนเข้าพื้นที่สาธารณะเดียวกันโดยอัตโนมัติ API ดูแลบัญชี เซสชัน รายชื่อผู้เล่นออนไลน์ ตำแหน่งตัวละครขณะเล่น และผังเฟอร์นิเจอร์กลาง ทั้ง `user` และ `admin` เล่นในแมพเดียวกัน เฉพาะ `admin` มีสิทธิ์วาง ย้าย และลบเฟอร์นิเจอร์

## สัญญา API v1

เสนอ REST JSON และ WebSocket ใต้ `/api/v1` ให้ repo นี้เผยแพร่ OpenAPI, schema ข้อความ WebSocket และ fixtures แบบระบุเวอร์ชันจาก `packages/contracts/` เมื่อสัญญาเป็น Frozen แล้ว `web` และ `admin` ใช้ fixtures รุ่นเดียวกันเพื่อเริ่มเทสต์ได้ ผู้ผลิตทดสอบ response และข้อความจริงกับ schema ก่อนสลับ consumer ไปเรียก API จริง

| ผู้ผลิต | Endpoint | ผู้ใช้สัญญา | ผลสำเร็จและกติกา |
|---|---|---|---|
| AUTH-010 | `POST /auth/login` | AUTH-020, AUTH-030 | รับ `{email,password}` คืน `200 {user}` และออก session cookie |
| AUTH-010 | `GET /auth/me` | AUTH-020, AUTH-030 | คืน `200 {user}` จากเซสชันปัจจุบัน |
| AUTH-010 | `POST /auth/logout` | AUTH-020, AUTH-030 | เพิกถอนเซสชันและล้าง cookie คืน `204` แม้เรียกซ้ำจาก origin ที่อนุญาต |
| ROOM-010 | `GET /rooms/public/layout` | ROOM-020, LIVE-010 | ผู้ใช้ที่ล็อกอินอ่านผังกลางได้ คืน `200 {revision,placements}` ผังเริ่มที่ revision 0 และรายการว่าง |
| ROOM-010 | `PUT /rooms/public/layout` | ROOM-020, LIVE-010 | เฉพาะแอดมินบันทึกผังด้วย `{revision,placements}` สำเร็จแล้วคืน `200` พร้อมผังและ revision ใหม่ พร้อมส่งข้อมูลหลัง commit ให้ LIVE-010 |
| LIVE-010 | `GET /rooms/public/live` (WebSocket upgrade) | LIVE-020 | หลังตรวจเซสชันและ origin ให้เข้าพื้นที่กลางทันที ส่งสถานะผู้เล่นและผังกลางตามสัญญา WebSocket |
| USER-010 | `GET /admin/users?offset=0&limit=20` | USER-020 | คืน `200 {items,total}` เรียงด้วย `id` และจำกัด `limit` ไว้ที่ 1–100 |
| USER-010 | `PATCH /admin/users/{userId}` | USER-020 | รับ `{displayName}` คืน `200 {user}` จากข้อมูลที่บันทึกแล้ว |

- `user` ประกอบด้วย `id`, `email`, `displayName` และ `role` ซึ่งเป็น `user` หรือ `admin` ค่า `displayName` ตัดช่องว่างหัวท้ายแล้วต้องยาว 1–80 Unicode code points ฟิลด์ที่ระบุใน payload เป็น required และใช้ค่าที่ไม่ใช่ `null` คำขอเขียนที่มีฟิลด์เกินจาก schema คืน `422`
- รูปแบบข้อผิดพลาดคือ `{error:{code,message}}` หน้าเว็บเลือกข้อความจาก `code` ใช้ `401 INVALID_CREDENTIALS` เมื่อข้อมูลล็อกอินผิด, `401 UNAUTHENTICATED` เมื่อเซสชันไม่มีหรือหมดอายุ, `403 FORBIDDEN` เมื่อสิทธิ์ไม่ถึงหรือ origin ไม่ได้รับอนุญาต, `404 USER_NOT_FOUND` เมื่อไม่พบผู้ใช้, `409 ROOM_REVISION_CONFLICT` เมื่อผังล้าสมัย และ `422 VALIDATION_ERROR` เมื่อข้อมูลผิดกติกา
- สัญญา `room-definition.v1.json` กำหนดขนาดกริด จุดเกิด ช่องกีดขวาง และ catalog พร้อมขนาดเฟอร์นิเจอร์ หนึ่ง placement มี `id`, `itemId`, `x` และ `y` พิกัดเป็นจำนวนเต็มเริ่มที่ 0 จากมุมซ้ายบน ใช้ `id` ที่ไม่ซ้ำในผังเพื่อติดตามชิ้นเดิมขณะย้าย API ตรวจพื้นที่เต็มชิ้นกับขอบแมพ จุดเกิด สิ่งกีดขวาง และชิ้นอื่น การอัปเดตใช้ revision เปรียบเทียบและบันทึกแบบ atomic เพิ่ม revision หนึ่งครั้งต่อ commit สำเร็จ คำขอที่อ้าง revision เก่าได้ `409` และโหลดผังล่าสุดซ้ำได้
- Session ID เป็นค่า opaque อยู่ใน cookie แบบ host-only ที่ตั้ง `HttpOnly`, `Secure` และ `SameSite=Lax` แต่ละ frontend เรียกผ่าน same-origin proxy ของตัวเอง โดย proxy ของเว็บรองรับ WebSocket upgrade API ตรวจ `Origin` สำหรับคำขอเขียนจากเบราว์เซอร์และสำหรับ WebSocket ตรวจ role จากบัญชีปัจจุบัน และเก็บรหัสผ่านแบบ hash
- Fixtures ครอบคลุม login สำเร็จหรือผิด เซสชันหมดอายุ ผังว่าง/ผังที่ถูกแก้ placement เกินขอบหรือทับจุดเกิด revision เก่า ผู้เล่นเข้า/ออก snapshot หลัง reconnect คำสั่งเดินผิด schema และการแก้ชื่อผู้ใช้ด้วย role ต่างกัน

### สัญญา WebSocket v1

| ทิศทาง | ข้อความ | กติกา |
|---|---|---|
| API → Web | `welcome {selfPlayerId,tick,players,layout}` | ข้อความแรกของการเชื่อมต่อ มีผู้เล่นปัจจุบันและผังล่าสุด โดย `layout` มีรูปเดียวกับ REST |
| Web → API | `input {seq,dx,dy}` | ส่งทิศทางในช่วง `-1, 0, 1` ต่อแกน และ `seq` เพิ่มขึ้นต่อ connection ข้อความผิด schema ถูกปฏิเสธ และ `seq` ที่ซ้ำหรือล้าสมัยถูกละทิ้ง |
| API → Web | `players {tick,players}` | รายการผู้เล่นปัจจุบันทั้งชุด เรียงตามลำดับ tick ผู้เล่นแต่ละคนมี `playerId`, `displayName`, `x`, `y` พิกัดผู้เล่นใช้หน่วยช่องและเป็นทศนิยมได้ |
| API → Web | `layout.updated {revision,placements}` | ส่งผังทั้งหมดหลัง commit สำเร็จให้ทุก connection เว็บใช้เฉพาะ revision ที่ใหม่กว่าผังที่แสดง |

API คำนวณตำแหน่งด้วย fixed timestep คุมความเร็วรวมแนวทแยง และชนเฉพาะขอบกับสิ่งกีดขวางถาวรของแมพใน MVP ผู้เล่นและเฟอร์นิเจอร์ใช้เป็นองค์ประกอบภาพในการเคลื่อนที่ เสนอให้ MVP มีผู้เล่นหนึ่งตัวต่อการเชื่อมต่อ แต่ละ connection ที่เชื่อมใหม่ได้ `playerId` ใหม่และเริ่มจากจุดเกิด การปิดการเชื่อมต่อหรือ heartbeat หมดเวลาจะลบตัวละคร ส่วน logout หรือเซสชันหมดอายุจะปิด connection ที่เกี่ยวข้องด้วย close code `1008` คำขอ upgrade ที่ไม่มีเซสชันได้ `401` และ origin ที่ผิดได้ `403`

เสนอให้ MVP ใช้ตัวประมวลผลพื้นที่กลางหนึ่ง instance เพื่อจัดลำดับการรับผู้เล่นและส่งผังหลัง commit ตรวจให้การเชื่อมต่อที่เกิดระหว่างบันทึกได้รับผัง revision ล่าสุดผ่าน `welcome` หรือ `layout.updated` ตำแหน่งอยู่ในหน่วยความจำ ส่วนผังกลางยังอ่านจากฐานข้อมูลได้หลัง restart

## Task Cards

### สถานะงานจากการทดสอบในเครื่อง

- CONTRACT-010 เตรียม OpenAPI, WebSocket schema, room definition และ fixtures เป็นแพ็กเกจ `@test-workflow/virtual-room-contracts` รุ่น `1.0.0` ให้ Web และ Web Admin อ้างอิง tarball จาก revision เดียวกันหลังรีวิวสัญญา
- AUTH-010 ทดลอง login, me และ logout กับ SQLite บน Node 24 แล้ว การทดสอบในเครื่องใช้บัญชีชั่วคราวและฐานข้อมูลในหน่วยความจำ การตั้งค่า runtime และการต่อ `src/app.ts` เข้ากับ auth handler อยู่ในขอบเขตการ์ด AUTH-010
- ROOM-010, LIVE-010 และ USER-010 ยังเป็นงาน API ตามลำดับ dependency ในตาราง

CONTRACT-010 กำหนดสคริปต์ใน `package.json` ให้ `test` รัน `vitest run`, `lint` รัน `eslint .`, `typecheck` รัน `tsc --noEmit` และใช้ `pnpm test`, `pnpm lint`, `pnpm typecheck` ตรวจงาน โครง runtime และแนวทาง DB migration ให้ยืนยันพร้อม CONTRACT-010 ก่อนเริ่มการ์ด Feature

| การ์ด | ทำหลัง | Owned Paths | Acceptance Criteria |
|---|---|---|---|
| CONTRACT-010 กำหนดสัญญา v1 · Infra · 3 แต้ม | เริ่มได้ทันที | `packages/contracts/**`, `tests/contracts/**`, `package.json`, `pnpm-lock.yaml`, `tsconfig.json`, `vitest.config.ts`, `eslint.config.mjs`, `.github/workflows/verify-api.yml` | ตรวจ schema และ fixtures ได้ใน CI และ consumer ทั้งสอง pin รุ่นเดียวกันได้ |
| AUTH-010 ยืนยันตัวตนและจัดการเซสชัน · Feature · 5 แต้ม | CONTRACT-010 | `src/app.ts`, `src/auth/**`, `tests/auth/**`, `migrations/001-auth.*`, สคริปต์ `dev` ใน `package.json` | Login, me และ logout ผ่าน API integration test กับฐานข้อมูลทดสอบ เซสชันหมดอายุหรือถูกเพิกถอนใช้ต่อไม่ได้ |
| ROOM-010 อ่านและบันทึกผังพื้นที่กลาง · Feature · 5 แต้ม | CONTRACT-010, AUTH-010 | `src/rooms/layout/**`, `tests/rooms/layout/**`, `migrations/002-rooms.*` | ทุกบัญชีอ่านผังชุดเดียวกัน เฉพาะแอดมินแก้ไขได้ ตรวจตำแหน่งและ revision ใน transaction และเผยแพร่ผังหลัง commit |
| LIVE-010 ดูแลผู้เล่นและกระจายสถานะพื้นที่กลาง · Feature · 8 แต้ม | CONTRACT-010, AUTH-010, ROOM-010 | `src/rooms/live/**`, `tests/rooms/live/**` | ตรวจเซสชันตอนเชื่อมต่อและระหว่างเล่น ทุก connection เห็นผู้เล่นและผังชุดเดียวกันตาม tick และ revision |
| USER-010 อ่านผู้ใช้และแก้ชื่อ · Feature · 5 แต้ม | CONTRACT-010, AUTH-010 | `src/admin/users/**`, `tests/admin/users/**` | เฉพาะแอดมินเปิดรายการและแก้ชื่อได้ การอ่านรายการและ `GET /auth/me` ของบัญชีที่ถูกแก้สะท้อนชื่อใหม่ |

**Must Not Modify** จำกัดการแก้ไขตาม Owned Paths ของการ์ด สัญญาที่ Frozen แล้วแก้ผ่านการ์ดสัญญาใหม่เท่านั้น แต่ละ feature ลงทะเบียน handler ผ่านขอบเขตที่ app entry point เตรียมไว้

### การ์ด ClickUp

เปิด PR แผนจาก fork เข้า `develop` ของ upstream และอ้างลิงก์ในรายละเอียดการ์ด ช่อง `PR Link` ใช้กับ Draft PR สำหรับ RED ของการ์ดแต่ละใบหลังได้รับอนุมัติเป็น `ready`

| Task Card | ClickUp |
|---|---|
| CONTRACT-010 | [DEV-6046 Define Virtual Room API Contract](https://app.clickup.com/t/z929e7qhgt) |
| AUTH-010 | [DEV-6051 Implement API Login and Sessions](https://app.clickup.com/t/z929e7qhgy) |
| ROOM-010 | [DEV-6052 Persist Shared Room Layout](https://app.clickup.com/t/z929e7qhgz) |
| LIVE-010 | [DEV-6054 Synchronize Live Room Players](https://app.clickup.com/t/z929e7qhh1) |
| USER-010 | [DEV-6053 Add Admin User Management API](https://app.clickup.com/t/z929e7qhh0) |

ให้ Tech Lead อนุมัติแผนและเปลี่ยนการ์ดเป็น `ready` ก่อนเริ่ม RED ทำทีละการ์ดบน branch ที่มีรหัส ClickUp เปิด Draft PR เข้า `develop` โดยใช้ `ClickUp-Task: <CLICKUP-ID>` เป็นบรรทัดแรกของ PR แล้วรอ Dev ยืนยันผล RED ก่อนทำ GREEN และ REFACTOR

### RED ที่ต้องเห็นก่อนเขียนโค้ด

| การ์ด | RED scenarios |
|---|---|
| CONTRACT-010 | **RED-1** Fixture ถูกต้องของ REST และ WebSocket ผ่าน schema ของแต่ละข้อความ **RED-2** ข้อความขาดฟิลด์บังคับ มี role ผิด หรือส่งพิกัดมาแทนคำสั่งเดินถูกปฏิเสธ **RED-3** ตัวตรวจ room definition ปฏิเสธจุดเกิดนอกกริดและ catalog ที่มี ID ซ้ำ |
| AUTH-010 | **RED-1** ล็อกอินสำเร็จพร้อม cookie ตามสัญญา และ cookie ใช้กับ `/auth/me` ได้ **RED-2** อีเมลที่ไม่มีและรหัสผ่านผิดให้ผล `401 INVALID_CREDENTIALS` รูปแบบเดียวกันและไม่มี cookie ใหม่ **RED-3** เซสชันหมดอายุหรือถูก logout คืน `401` และคำขอเขียนจาก origin ที่ผิดคืน `403` |
| ROOM-010 | **RED-1** แอดมินย้ายของแล้วผู้ใช้ A และ B อ่าน revision เดียวกัน ผู้ใช้ทั่วไปส่ง PUT ตรงได้ `403` และเมื่อไม่มีเซสชันทั้ง GET กับ PUT ได้ `401` **RED-2** ตำแหน่งผิดกติกาคืน `422` และไม่มีการบันทึกหรือเผยแพร่ผัง **RED-3** แอดมินสองคนบันทึก revision เดียวกันได้ `200` เพียงคำขอเดียว อีกคำขอได้ `409` และเผยแพร่เฉพาะผลที่ commit |
| LIVE-010 | **RED-1** สองเซสชันเข้าแมพเดียวกัน เห็นการเดินและการออกของอีกฝ่าย โดยอินพุตเท่ากันให้ตำแหน่งซ้ำได้และชนกำแพง **RED-2** upgrade ผิด origin หรือไม่มีเซสชันถูกปฏิเสธ และเซสชันที่ logout หรือหมดอายุถูกตัดพร้อมนำตัวละครออก **RED-3** สอง connection ที่เปิดอยู่และ connection ที่เข้าระหว่างบันทึกได้รับผัง revision ล่าสุด ส่วน PUT ที่ถูกปฏิเสธไม่ส่ง event |
| USER-010 | **RED-1** แอดมินอ่านรายการแบบแบ่งหน้าและแก้ชื่อไทยได้ ชื่อใหม่ปรากฏในการอ่านครั้งถัดไป **RED-2** ผู้ใช้ทั่วไปได้ `403` จากทั้ง GET และ PATCH ส่วนผู้ไม่มีเซสชันได้ `401` **RED-3** ชื่อว่าง ชื่อเกิน 80 ตัวอักษร หรือ payload ที่พยายามเปลี่ยน `role` ได้ `422` เป้าหมายที่ไม่มีอยู่ได้ `404` |

ก่อนปิดงาน ให้รัน producer contract tests และ integration tests กับฐานข้อมูลทดสอบ แล้วให้ browser suites ของทั้งสอง repo ใช้ API build เดียวกันเพื่อยืนยันเส้นทางใช้งานจริง

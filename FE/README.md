# Trelolara — Frontend

React 19, TypeScript strict, Vite 7, React Router, TanStack Query, Tailwind CSS 4, shadcn/ui–Radix và dnd-kit. Mã được tổ chức theo tính năng; toàn bộ test nằm trong `tests/`.

Tài liệu cập nhật **26/10/2026**. Xem [README dự án](../README.md) để biết tính năng và cách sử dụng; [đối chiếu BE–FE](INTEGRATION.md) ghi hợp đồng API và kết quả kiểm tra gần nhất.

## Chạy phát triển

Dùng Node **22.22.2+ trong nhánh 22**, **24.15.0+ trong nhánh 24**, hoặc bản đáp ứng `engines` của công cụ trong lockfile. Môi trường đã xác minh: Node 24.16.0/npm 11.13.0; nên dùng Node 24.

Chạy trong `FE/`:

```powershell
npm ci
if (-not (Test-Path -LiteralPath .env)) {
  Copy-Item -LiteralPath .env.example -Destination .env
}
```

Giữ cấu hình local nếu đã có. Điền [`.env.example`](.env.example) theo BE được chỉ định:

| Biến | Giá trị |
| --- | --- |
| `VITE_ENV` | Môi trường đang dùng, ví dụ `development` |
| `VITE_APP_NAME` | Tên ứng dụng, mặc định trong mẫu là `Trelolara` |
| `VITE_API_BASE_URL` | URL gốc BE, không thêm `/api` hoặc dấu `/` cuối; ví dụ `http://localhost:3000` |
| `VITE_WS_URL` | WebSocket của cùng BE, gồm `/ws`; ví dụ `ws://localhost:3000/ws` |

Mọi biến `VITE_*` có thể xuất hiện trong bundle, không chứa bí mật. FE dùng cookie HttpOnly nên BE cần cho phép đúng origin cùng credentials; đối chiếu cấu hình trong [tệp mẫu BE](../BE/.env.example).

```powershell
npm run dev
```

Vite cấu hình cổng 5173 và tự mở `/dashboard`. Truy cập `/` để xem landing. Các tuyến workspace yêu cầu phiên đăng nhập.

## Cấu trúc và trách nhiệm

```text
src/
├── app/           # Providers, i18n/locales, CSS public/landing/workspace
├── components/    # UI primitive, layout và thành phần dùng chung
├── features/      # auth, catalog, boards, cards, discovery, notifications…
├── pages/         # Ranh giới tuyến
└── lib/           # API transport, môi trường và tiện ích
public/
└── illustrations/dither-burn.webp
tests/
├── unit/          # *.test.ts/tsx, phản chiếu các miền trong src/
├── support/       # setup.ts, helpers.ts, fixtures.ts cho Vitest
└── e2e/           # *.spec.ts và fixture trình duyệt
```

API/DTO/adapter/query và mutation nằm trong tính năng tương ứng. UI gọi API theo tính năng, không import trực tiếp `apiClient`. Dữ liệu server do TanStack Query quản lý; không còn Zustand hoặc store thứ hai cho thứ tự thẻ/danh mục.

Các trang và form xác thực dùng `React.lazy`; `Board` và `CardDialogBody` không nằm trong chunk vào đầu. Suspense/lỗi tải nằm trong khung điều hướng hoặc hộp thoại, giữ Board và nút đóng khi tải chậm. Không dùng key theo theme/ngôn ngữ để dựng lại page/provider và làm mất bản nháp.

## Các tuyến chính

| Tuyến | Nội dung |
| --- | --- |
| `/` | Landing một màn hình |
| `/login`, `/register`, `/verify`, `/forgot-password` | Xác thực, OTP và khôi phục |
| `/dashboard`, `/projects`, `/projects/:projectId` | Tổng quan và danh mục dự án/bảng |
| `/boards/:boardId` | Kanban |
| `/boards/:boardId/cards/:cardId` | Chi tiết thẻ trong Board |
| `/my-work` | Công việc được giao |
| `/boards/:boardId/search` | Tìm thẻ trong bảng |
| `/archived`, `/me` | Lưu trữ và hồ sơ |
| `/invite/projects/:token`, `/invite/boards/:token` | Xác nhận lời mời sau đăng nhập |

My Work và tìm kiếm có tuyến con mở thẻ; đóng hộp giữ bộ lọc, focus và vị trí cuộn. Đường `returnTo` được kiểm tra để tránh URL ngoài ứng dụng/vòng lặp auth, được giữ qua login/register/verify/recovery. Google dùng endpoint/callback BE hiện có và lưu tạm đường quay lại trong sessionStorage.

## Quy ước giao diện

Workspace giữ thanh điều hướng biểu tượng, nội dung giữa và panel lịch bên phải; trên màn hình nhỏ, điều hướng/panel dùng cơ chế thu gọn hiện có. `src/app/workspace.css` dùng token sáng/tối chung cho bề mặt, khoảng cách, chữ, focus và điều khiển. `app-page` chỉ đánh dấu trang nội dung, không áp vào canvas Kanban.

Số liệu chia thành các ô bằng nhau và căn giữa trong từng ô; tìm kiếm giãn theo phần còn lại, bộ lọc/tab cùng chiều cao và xuống hàng khi thiếu chỗ. Hồ sơ/cài đặt có giới hạn chiều rộng và căn giữa. Nút, checkbox và icon giữ vùng bấm/căn chỉnh nhất quán; trên điện thoại phần tổng kết gọn để danh sách xuất hiện sớm. Cột/thẻ và thao tác kéo thả Kanban được giữ; thẻ có thêm huy hiệu số tệp theo yêu cầu.

Việt/Anh và sáng/tối/theo hệ thống dùng i18n, next-themes và `AppProviders`. Mặc định tiếng Việt, theme theo hệ thống. Preference lưu tại `trelolara-language`/`trelolara-theme`, không lưu token. Mỗi thay đổi cần giữ nhãn, bàn phím, focus, bản nháp, dữ liệu thật và `prefers-reduced-motion`.

### Landing và auth

- `src/app/landing.css` bố trí `/` trong một viewport, không có nội dung phía dưới hoặc liên kết cuộn.
- `DitherBurnBackground` là lớp nền cố định dưới nội dung, dùng chung cho landing, Login/Register, quên mật khẩu và xác minh. `src/app/public.css` giữ thương hiệu, nền và kiểu form thống nhất; auth dùng `AccessLayout`.
- SVG Particle và ảnh cũ đã bỏ. `DitherBurnCanvas` dùng hai shader Dither Burn — Originkit do người dùng cung cấp; không thêm thư viện đồ họa. Canvas tải theo nhu cầu, giới hạn 30 fps, DPR 1.5 và khoảng 1.5 triệu pixel; ngừng khi tab ẩn, có nút tạm dừng.
- Giảm chuyển động, thiết bị không hover, viewport dưới 768 px hoặc WebGL không khả dụng/mất context dùng poster `public/illustrations/dither-burn.webp`; nhánh tĩnh không tải module GPU.
- Login/Register dùng chung độ rộng, trường, nút và chuyển động. Form dài được cuộn tự nhiên trên màn hình thấp để không che trường/lỗi/bàn phím. Các cổng phiên, lời mời và trang lỗi dùng layout cơ bản.
- Chuyển động xuất hiện/hover/nhấn/hộp thoại dùng CSS; giảm chuyển động tắt hiệu ứng không cần thiết. Không thay validation, autocomplete, OAuth hoặc cách giữ nháp khi đổi giao diện.

## Dữ liệu, phiên và nghiệp vụ

### Phiên đăng nhập

`apiClient.get<T>()` và các phương thức ghi trả body `ApiEnvelope<T>`, không phải `AxiosResponse`. Cookie do BE quản lý và gửi bằng `withCredentials`; FE không đọc/ghi token trong storage. Nhiều 401 trong một tab dùng chung một refresh có hạn 10 giây, mỗi request gửi lại tối đa một lần. Mất mạng/timeout không tự coi là đăng xuất; URL API thiếu/sai được báo trước khi gửi request.

`AppProviders` nằm trong Router, cung cấp Query, phiên, theme/i18n và một Toaster. `/users/me` là nguồn dữ liệu người dùng, khóa theo thế hệ phiên. Route riêng chờ xác minh danh tính và cho thử lại khi lỗi tạm. Đăng nhập mới, hết phiên hoặc đăng xuất thành công hủy request/xóa Query; action cũ không được ghi vào phiên mới. Đăng xuất lỗi giữ phiên và cho thử lại.

### Danh mục và cộng tác

Query được phân phạm vi theo phiên/người dùng/tài nguyên. Dự án, bảng và thành viên dự án tải thêm theo trang 10 hàng; thành viên bảng dùng danh sách BE đầy đủ. Chưa tải hết dự án thì chưa kết luận một bảng là bảng khách. Tạo/sửa/lưu trữ/thay đổi thành viên cập nhật cùng cache.

Hộp thành viên cho phép tra cứu người dùng để điền email, hoặc tạo liên kết mời với vai trò/hạn. Chọn một người không tự gửi lời mời. Trang lời mời gọi POST accept/reject sau khi người dùng quyết định; không có màn inbox dựng từ endpoint không tồn tại. UI phân biệt lời mời đã lưu với lỗi gửi email/thông báo, không tự gửi lại.

### Kanban và thẻ

`features/boards/` quản lý danh sách, summary và thứ tự; `features/cards/` quản lý chi tiết thẻ. Summary và detail không ghi vào cùng tập thẻ. `boardQueue` tuần tự hóa ý định ghi theo phiên/người dùng/bảng trong tab, cập nhật sau thả rồi đối soát server; đọc nền chờ hàng ghi để tránh ghi đè. `useBoardRealtime` đọc revision chuỗi bằng BigInt, tải lại sau ack/reconnect/revision mới, xử lý sự kiện trong lúc đọc và thu quyền. Socket thông báo cá nhân tách khỏi đăng ký board.

Kéo thả dùng Mouse/Touch/KeyboardSensor, Sortable và DragOverlay. Enter mở thẻ; Space/mũi tên/Space hoặc Enter/Escape phục vụ kéo bàn phím. Tay nắm danh sách và menu chuyển/lưu trữ cung cấp cách thao tác khác. Reduced motion tắt chuyển động kéo thả.

Hộp thẻ trên điện thoại dùng một cột/một vùng cuộn. Refetch/đổi locale/theme không dựng lại form. Lỗi ghi giữ nháp; đóng hộp vẫn bỏ nháp như trước và chưa có cảnh báo rời trang. Tiêu đề/mô tả gửi PATCH thật; mô tả trống dùng null. Form tạo danh sách chỉ có tên vì API không lưu mô tả.

Tệp đính kèm, lịch sử, checklist, nhãn và số tệp sử dụng API BE hiện có; xem [hợp đồng và giới hạn](INTEGRATION.md). FE yêu cầu `_count.attachments` ở danh sách/tìm kiếm và `attachmentCount` ở chi tiết: cập nhật BE trước hoặc cùng FE, không suy số lượng giả khi thiếu trường.

### Hồ sơ và thông báo

Hồ sơ hỗ trợ multipart, đổi mật khẩu và tùy chọn hiển thị. Ảnh phải thuộc loại ảnh, tối đa 5 MB; lỗi lưu giữ nháp. BE bỏ qua địa chỉ/giới thiệu trống nên UI giải thích khi xóa trắng giá trị đã lưu. Không dựng nút xóa tài khoản hoặc công tắc email chưa có xử lý. Đổi mật khẩu gửi `{ newPassword }`, giữ hộp khi lỗi/đang ghi và xóa trường bí mật khi đóng. BE hiện phân biệt tài khoản chưa xác minh qua thông báo lỗi; cần thay cách nhận diện khi có mã lỗi riêng.

Thông báo dùng bộ lọc `isRead`, phân trang/cache theo phiên/người dùng. Metadata thiếu không tạo liên kết lời mời giả. Đánh dấu tất cả đã đọc làm mới trang/count từ BE. Socket cá nhân dùng một kết nối theo phiên/người dùng, backoff tối đa tám lỗi liên tiếp; online/quay lại tab/làm mới có thể nối lại. Callback cũ không tạo kết nối mới và refresh cookie được dùng chung.

## Lệnh kiểm tra

| Lệnh | Phạm vi |
| --- | --- |
| `npm test` | Vitest một lần; `npm run test:watch` để theo dõi |
| `npm run lint` | ESLint toàn FE, không tự sửa |
| `npm run build` | TypeScript ứng dụng/test/cấu hình rồi Vite tạo `dist/` |
| `npm run check` | Lint → build → graph/import/bundle → Vitest với hai worker |
| `npm run preview` | Xem bundle đã build |
| `npm run test:e2e` | Build cô lập rồi kiểm thử Chrome với API/WebSocket giả |
| `npm run test:e2e:live` | Build cô lập và kiểm thử với BE test thật |

`check` chặn module TS bỏ quên, vòng import runtime, dependency chưa khai báo, Board/nội dung thẻ tải sẵn và chunk JS vượt 500 kB. Số đo lưu tại `node_modules/.tmp/frontend-check.json`.

### Unit/component

Test mới đặt dưới `tests/unit/`, import mã ứng dụng bằng `@/` và helper bằng đường dẫn tương đối tới `tests/support/`. `tsconfig.test.json` và `tsconfig.e2e.json` kiểm tra kiểu test trong `npm run build`.

Vitest dùng jsdom, tắt đọc `.env`, URL `api.test` và mặc định giảm chuyển động. Harness chặn Axios adapter mặc định, fetch, XMLHttpRequest và WebSocket chưa mock; không cần BE, tài khoản hoặc DB. Fixture bám envelope/DTO thật của BE. Không bỏ chặn mạng để gọi dịch vụ thật từ unit test.

jsdom không đo bố cục; stub ResizeObserver/elementFromPoint chỉ phục vụ vòng đời primitive. Kích thước, focus, kéo thả và WebGL phải kiểm tra bằng trình duyệt.

### Chrome với API giả

```powershell
npm run test:e2e
```

Dùng Chrome đã cài (`channel: "chrome"`), không cần tải browser riêng. Cấu hình 6 tổ hợp: desktop 1440×900, tablet 768×1024, phone 390×844 × sáng/tối. Public tests thêm màn hình nhỏ/ngang và Việt/Anh; kiểm tra WebGL bằng pixel, khung hình, tạm dừng, mất context và ảnh chụp. Tham số software WebGL chỉ thuộc môi trường test, không yêu cầu người dùng bật cờ trình duyệt.

`.env.e2e` và preview cổng 4173 tách khỏi server phát triển. Fixture HTTP/WebSocket chặn mạng ngoài test; `testMatch` gồm `app.spec.ts`, `project.spec.ts`, `features.spec.ts`, `public.spec.ts`. Public tests tắt trace screencast liên tục để tránh ảnh hưởng render GPU; bộ khác giữ trace khi lỗi. Báo cáo/ảnh/trace trong `node_modules/.tmp/e2e-*`, được Git bỏ qua.

### Với BE test thật

Cần BE đã migrate, worker nhắc hoạt động và hai tài khoản **khác nhau, đã xác minh** trên môi trường test được chỉ định:

```powershell
if (-not (Test-Path -LiteralPath .env.e2e-live.local)) {
  Copy-Item -LiteralPath .env.e2e-live.example -Destination .env.e2e-live.local
}
# Điền cấu hình/tài khoản trong .local rồi lưu.
npm run test:e2e:live
```

Chỉ điền bí mật vào `E2E_*` trong tệp `.local`, không vào `VITE_*` hoặc tệp mẫu. Bộ thật dùng `localhost:5173` cho cookie/CORS; chỉ dùng lại server nếu xác minh đúng mã/URL API, nếu cổng trống sẽ phục vụ preview riêng. Không dừng server của người dùng.

Kịch bản tạo tài nguyên có tiền tố `M7-E2E-`, kiểm tra hai phiên, LINK không gửi email, revision, kéo bàn phím, My Work/tìm kiếm, sửa mô tả, tệp/lịch sử/số lượng và nhắc qua worker/socket. Dọn qua API bằng ngữ cảnh riêng kể cả khi UI hết thời gian: xóa bảng/dữ liệu con, dự án xóa mềm theo BE. Không chạy migration, truy cập DB trực tiếp hoặc sửa tài khoản; có ghi dữ liệu test vào DB qua API.

Trace/ảnh/video tắt cho bộ thật. Nhật ký lỗi local có thể chứa dữ liệu tài khoản, không đưa vào Git/báo cáo công khai. Chrome mô phỏng điện thoại không thay thế thiết bị thật. [Kết quả hiện tại và phần chưa kiểm tra](INTEGRATION.md#kết-quả-ngày-26102026) là nguồn tổng hợp, thay cho các kết quả mốc cũ.

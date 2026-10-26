# Trelolara — Frontend

M1–M7 đã triển khai: kiến trúc theo tính năng, Framed sheet, Board/thẻ, kéo thả/đồng bộ revision, My Work, tìm kiếm, hạn/nhắc và các màn hình tài khoản. **370 test/30 tệp, 54 hành trình Chrome, lint/build và tích hợp BE local cốt lõi đều đạt; audit không còn cảnh báo**. M7 chia tải theo tuyến, dọn mã/gói thừa, sửa tiêu đề tablet và reconnect thông báo. Xem [báo cáo M7, ảnh và giới hạn nghiệm thu](../docs/frontend-modernization/17-milestone-m7-results.md).

React 19, TypeScript strict, Vite 7, React Router, TanStack Query và Tailwind 4. A–D sửa nền build/test, phiên/API, danh mục và tính đúng đắn của Kanban/thẻ. M2 dùng khung xám xanh, bề mặt trắng/tối, chữ trung tính và xanh cho hành động. M7 đã gỡ Zustand và các gói không dùng; dữ liệu server chỉ do Query quản lý.

## Ngôn ngữ, giao diện và điều hướng

Menu Tùy chọn hiển thị trên thanh công cụ đổi Việt–Anh và sáng/tối/theo hệ thống. Mặc định tiếng Việt, giao diện theo hệ thống. `app/i18n.ts` và `app/locales/` giữ từ điển; `AppProviders` cung cấp i18n, next-themes, Query, phiên và một Toaster chung. Không dùng theme/ngôn ngữ làm key của page/provider để giữ bản nháp. Preference lưu riêng bằng `trelolara-language` và `trelolara-theme`; không lưu thông tin xác thực vào đó.

`/dashboard` là tổng quan; `/projects` là danh mục có phân trang; `/projects/:projectId`, `/boards/:boardId/cards/:cardId` và `/me` giữ các luồng hiện có. Sidebar có nhãn và đóng sau khi chọn tuyến trên điện thoại. `/my-work` là Công việc của tôi; `/boards/:boardId/search` tìm thẻ trong bảng. Các tuyến con chi tiết giữ bộ lọc, focus và vị trí cuộn khi đóng. M5 bổ sung hạn/hoàn thành/nhắc trong chi tiết, huy hiệu hạn trên Kanban và bộ lọc có con trỏ từ API hiện có. M2 đã dịch shell, dashboard, danh mục, tạo dự án/bảng, lưu trữ, thông báo và hồ sơ; M3 bổ sung Board, chi tiết thẻ và hộp thành viên. M6 hoàn thiện auth/OTP/khôi phục, lời mời, hồ sơ/mật khẩu, trang vào/404/cổng phiên và tiêu đề dự án theo cùng hệ hiển thị.

## Cài đặt và chạy

Dùng Node **22.22.2+ trong nhánh 22**, **24.15.0+ trong nhánh 24**, hoặc bản đáp ứng `engines` của Vitest/jsdom trong lockfile. Đã xác minh với Node 24.16.0 và npm 11.13.0. Nên dùng Node 24 cho môi trường phát triển này.

Chạy các lệnh sau trong thư mục `FE/`:

```powershell
npm ci
if (-not (Test-Path -LiteralPath .env)) {
  Copy-Item -LiteralPath .env.example -Destination .env
}
npm run dev
```

Chỉ sao chép `.env.example` khi chưa có `.env`; giữ cấu hình local đang dùng. Điền `VITE_API_BASE_URL` bằng URL BE local/test và `VITE_WS_URL` bằng URL WebSocket của cùng BE, có đường dẫn `/ws`. Cổng lấy từ cấu hình BE được chỉ định, không có cổng mặc định trong file mẫu. `VITE_APP_NAME` là tên ứng dụng; giữ `VITE_ENV` phù hợp môi trường đang dùng. Mọi biến `VITE_*` có thể xuất hiện trong bundle trình duyệt, nên không chứa bí mật.

Vite chạy tại `http://localhost:5173` và mở `/dashboard`. Các trang riêng cần phiên đăng nhập cùng cấu hình cookie/CORS của BE. README này không yêu cầu chạy build, migration hoặc test BE.

## Kiểm tra

```powershell
npm test
npm run build
npm run lint
npm run check
```

- `npm test`: Vitest chạy một lần; `npm run test:watch` dành cho phát triển. Không cần BE, tài khoản hoặc cơ sở dữ liệu.
- `npm run build`: kiểm tra TypeScript cho mã ứng dụng, test và cấu hình, rồi tạo `dist/` bằng Vite. Giữ các tùy chọn strict/unused hiện có.
- `npm run lint`: kiểm tra toàn FE; M7 đã xử lý toàn bộ nợ lint. UI không được import trực tiếp transport `apiClient`.
- `npm run check`: lint, TypeScript/build, đồ thị import/bundle và toàn bộ Vitest với hai worker. `scripts/check-frontend.mjs` chặn module TS không được dùng, vòng import runtime, dependency chưa khai báo, Board/nội dung thẻ tải sẵn hoặc chunk JS vượt 500 kB. Số đo ở `node_modules/.tmp/frontend-check.json`.
- `npm run preview`: xem bundle đã build; đây không phải xác minh đầy đủ luồng đăng nhập/nghiệp vụ.

## Ranh giới kiểm thử

Toàn bộ mã kiểm thử nằm trong `tests/`, tách khỏi mã ứng dụng ở `src/`:

```text
tests/
├── unit/          # Vitest: unit/component, giữ cây app/, components/, features/, lib/, pages/ tương ứng src/
│   └── setup.test.ts
├── e2e/           # Playwright: *.spec.ts và fixture trình duyệt
└── support/       # setup.ts, helpers.ts, fixtures.ts dùng chung cho Vitest
```

Test Vitest mới dùng tên `*.test.ts` hoặc `*.test.tsx` dưới `tests/unit/`; import mã ứng dụng qua alias `@/` và helper/fixture bằng đường dẫn tương đối tới `tests/support/`. Test Playwright dùng tên `*.spec.ts` dưới `tests/e2e/`; thêm kịch bản vào `testMatch` trong cấu hình Playwright phù hợp. `tsconfig.test.json` kiểm tra Vitest và support với cùng quy tắc strict của ứng dụng; `tsconfig.e2e.json` kiểm tra riêng E2E. Cả hai được chạy trong `npm run build`.

`vitest.config.ts` dùng lại plugin và alias Vite, tắt đọc file `.env`, dùng jsdom và các URL `api.test`. `tests/support/setup.ts` chặn Axios adapter mặc định, `fetch`, `XMLHttpRequest` và `WebSocket` chưa được mock. Test cần API phải khai báo mock hoặc adapter cụ thể; không bỏ chặn để gọi dịch vụ thật. Các test riêng kiểm chứng ranh giới này và các giá trị môi trường.

Fixture bình luận ở `tests/support/fixtures.ts` bám hợp đồng BE hiện tại: body `{ success: true, data: ... }`, `commentId`, `cardId`, tác giả và ngày ISO. Test component dùng Query, Router và primitive thật; dữ liệu đi qua Axios adapter giả theo từng projection của BE.

jsdom không đo layout. `ResizeObserver` và `elementFromPoint` chỉ là stub cho vòng đời primitive, không chứng minh kích thước, hit testing hay hành vi trình duyệt thật. Kiểm thử Chrome và BE thật được tách riêng bên dưới; các kết quả A–M6 giữ làm lịch sử.

## Kiểm thử trình duyệt sau M7

`@playwright/test` là dev dependency; dùng Chrome đã cài qua `channel: "chrome"`. Không cần tải thêm trình duyệt để chạy bộ này.

```powershell
npm run test:e2e
```

Lệnh build bản cô lập bằng `.env.e2e`, chạy 54 hành trình trên desktop 1440×900, tablet 768×1024 và điện thoại 390×844, sáng/tối. HTTP và WebSocket dùng fixture; địa chỉ ngoài preview/API giả bị chặn. Kiểm tra đăng nhập/returnTo, giữ nháp, hạn UTC, thông báo/lời mời, mất kết nối, tải module chậm/lỗi, focus, kéo bàn phím/chuột và bố cục. Chrome mô phỏng điện thoại không thay thế thiết bị thật. Báo cáo/ảnh/trace nằm trong `node_modules/.tmp/e2e-*` được Git bỏ qua.

Để chạy với backend test riêng, cần API/search/reminder/revision đã migrate, worker nhắc hoạt động và hai tài khoản đã xác minh. Tạo cấu hình riêng khi chưa có:

```powershell
if (-not (Test-Path -LiteralPath .env.e2e-live.local)) {
  Copy-Item -LiteralPath .env.e2e-live.example -Destination .env.e2e-live.local
}
# Điền tài khoản trong tệp .local, rồi lưu trước khi chạy.
npm run test:e2e:live
```

Chỉ điền bí mật vào `E2E_*` trong `.env.e2e-live.local`, không dùng `VITE_*` hoặc tệp mẫu. `.local` được Git bỏ qua. Luồng thật dùng `localhost:5173` cho cookie/CORS; chỉ dùng lại dev server khi nhận diện đúng mã M7 và URL API. Nếu cổng trống, bộ kiểm thử tự phục vụ bản build riêng; không dừng server của người dùng.

Kịch bản thật đăng nhập hai phiên, tạo tài nguyên có tiền tố `M7-E2E-`, chấp nhận LINK qua UI mà không gửi email, kiểm tra revision, di chuyển, My Work, tìm kiếm và nhận nhắc từ worker/socket. Bước kết thúc có ngữ cảnh HTTP riêng để dọn đúng tài nguyên của lần chạy kể cả khi phần UI hết thời gian. Bảng và dữ liệu con được xóa; dự án dùng chính sách xóa mềm của BE. Không chạy migration, truy cập DB trực tiếp hoặc sửa tài khoản. Trace/ảnh/video tắt cho bộ thật; nhật ký lỗi cục bộ có thể chứa dữ liệu tài khoản nên không đưa vào Git hay báo cáo công khai.

## Tải theo nhu cầu

Các trang riêng và form xác thực dùng `React.lazy`; React/Router dùng chung một chunk. Khung hộp thẻ mở ngay, còn `CardDialogBody` tải khi cần. Suspense nằm trong khung điều hướng/hộp thoại, giữ Board và nút đóng khi tải chậm. Đổi tuyến bình thường không dựng lại toàn bộ cây bằng key mới. Lỗi tải có thông báo Việt–Anh, quay về Tổng quan hoặc tải lại; nút tải lại giải thích việc mất nháp chưa lưu.

## API và phiên đăng nhập

`apiClient.get<T>()` và các phương thức ghi trả đúng body `ApiEnvelope<T>`, không phải `AxiosResponse`. Cookie HttpOnly do BE quản lý, gửi bằng `withCredentials`; FE không đọc/ghi token bằng CookieStore hoặc storage. Nhiều 401 trong cùng tab dùng một refresh có thời hạn 10 giây, mỗi request gửi lại tối đa một lần. Mất mạng/timeout không tự coi là đăng xuất. URL API thiếu/sai được báo lỗi trước khi gửi request.

`AppProviders` nằm trong Router, cung cấp Query và phiên. `/users/me` có khóa theo thế hệ phiên và là nơi giữ dữ liệu người dùng duy nhất. Route riêng chờ kiểm tra danh tính; lỗi tạm có nút thử lại. Đăng nhập mới, hết phiên hoặc đăng xuất thành công hủy request, xóa Query; action cũ không được ghi vào phiên mới. Đăng xuất lỗi giữ phiên/dữ liệu và cho thử lại. Store dự án đã gỡ ở C; store thẻ và hai hook cũ đã gỡ ở D.

Đường `returnTo` được giữ qua login/register/verify/recovery, kiểm tra để tránh URL ngoài ứng dụng và vòng lặp về trang auth. Google vẫn dùng endpoint/callback BE hiện có; FE giữ đường quay lại tạm trong sessionStorage. BE hiện chỉ phân biệt tài khoản chưa xác minh bằng thông báo lỗi; khi có mã lỗi riêng cần thay cách nhận diện này.

## Danh mục, thành viên và lời mời

`src/features/catalog/` giữ DTO và query theo thế hệ phiên/userId/phạm vi. Danh mục dự án/bảng và thành viên dự án có nút tải thêm theo trang 10 hàng; thành viên bảng dùng danh sách đầy đủ từ BE. Sidebar tải bảng con khi mở dự án; hộp thành viên tải thành viên/role khi mở. Tạo, đổi tên, lưu trữ và thay đổi thành viên cập nhật cùng cache, không ghi song song vào store cũ. Chưa tải đủ dự án thì chưa kết luận một bảng là bảng khách.

Liên kết BE `/invite/projects/:token` và `/invite/boards/:token` đi qua cổng đăng nhập, giữ returnTo và cho người dùng chọn chấp nhận/từ chối. FE chỉ gọi POST accept/reject, không có GET invitation/inbox. Kết quả gửi phân biệt lời mời đã lưu với trạng thái gửi email/thông báo; không tự gửi lại khi email lỗi.

## Kanban và chi tiết thẻ

`src/features/boards/` giữ danh sách, query summary theo board/list và helper thứ tự; `src/features/cards/` giữ DTO/adapter, API và query/mutation chi tiết thẻ. Summary board và detail không ghi vào cùng tập thẻ. Ghi cùng bảng đi qua hàng ghi theo phiên/người dùng/bảng trong tab; thứ tự đối soát với server sau ghi, không giữ store thứ tự lâu dài thứ hai. Lưu trữ/quan hệ cập nhật sau xác nhận; lỗi giữ nháp hoặc mục lưu trữ. Tiêu đề/mô tả gửi PATCH thật; mô tả trống dùng null.

M3 tách `BoardScreen`/`BoardColumn`/`BoardCard` và `CardDialog`/`CardEditor`/`CardChecklist`/`CardComments`; page chỉ giữ ranh giới tuyến. Menu danh sách có đổi tên/chuyển/lưu trữ. Dialog điện thoại toàn màn hình, một cột/một vùng cuộn; đổi locale/theme hoặc refetch không dựng lại biểu mẫu hay mất nháp. Đóng hộp vẫn bỏ nháp như trước, chưa có cảnh báo rời trang. Form tạo danh sách chỉ giữ tên vì ô mô tả cũ không được API lưu.

M4 dùng dnd-kit với Mouse/Touch/KeyboardSensor, Sortable và DragOverlay; gỡ engine HTML và parser DataTransfer. Thẻ bên cạnh dịch chuyển 180 ms, danh sách 220 ms, hiệu ứng hạ thẻ 200 ms; reduced motion tắt chuyển động. Tay nắm danh sách và menu chuyển/lưu trữ thẻ hỗ trợ cách thao tác khác. Enter mở thẻ; Space/mũi tên/Space hoặc Enter/Escape dùng cho kéo bàn phím.

`boardQueue` giữ ý định chưa xác nhận theo phiên/người dùng/bảng, cập nhật cache ngay khi thả, tuần tự hóa ghi và đối soát thứ tự server trước khi áp lại ý định còn chờ. Đọc nền chờ hàng ghi để không ghi đè phản hồi tức thời. `useBoardRealtime` đăng ký bảng đang xem, đọc revision chuỗi bằng BigInt, tải lại sau ack/reconnect/revision mới, xử lý sự kiện trong lúc đọc và thu quyền. Luồng refresh cookie được dùng chung; socket thông báo cá nhân giữ riêng như trước.

Đã kiểm tra ảnh 1440/768/390 px sáng/tối, nội suy chuyển động và 27 tình huống chuột/bàn phím/chạm qua CDP với API/socket giả cục bộ. Chưa kiểm chứng BE/WebSocket, nhiều người dùng hoặc cảm ứng trên thiết bị thật. Xem [ảnh, kết quả và giới hạn M4](../docs/frontend-modernization/14-milestone-m4-results.md).

## Hồ sơ và thông báo sau M6

Hồ sơ chỉ có các chức năng được API hỗ trợ: cập nhật multipart, đổi mật khẩu và tùy chọn hiển thị. Ảnh phải thuộc loại ảnh và không quá 5 MB; bản nháp giữ khi lưu lỗi. BE bỏ qua địa chỉ/giới thiệu trống nên FE giải thích khi xóa trắng giá trị đã lưu. Không hiển thị trạng thái tài khoản suy đoán, nút xóa tài khoản hoặc công tắc email chưa có xử lý. Đổi mật khẩu gửi `{ newPassword }`, giữ hộp khi lỗi/đang ghi và xóa trường bí mật khi đóng.

Thông báo dùng bộ lọc `isRead` của server, mỗi bộ lọc có cache/phân trang riêng theo phiên/người dùng. Token lời mời hợp lệ dẫn tới trang xác nhận; metadata thiếu không tạo liên kết giả. Tải thêm/làm mới/lỗi/thử lại nằm trong popover vừa điện thoại. Nội dung BE được giữ, nhãn và thời gian theo Việt–Anh. Xem [ảnh, 32 tình huống trình duyệt và giới hạn M6](../docs/frontend-modernization/16-milestone-m6-results.md).

Sau M7, socket thông báo chỉ có một kết nối theo phiên/người dùng, backoff tối đa tám lần lỗi liên tiếp và lấy lại trang đầu/count sau reconnect. Online/quay lại tab/làm mới nối lại khi cần; refresh cookie dùng chung và callback cũ không tạo thêm kết nối. Khởi động lại dev server hiện có để nạp Vite đã vá; các lệnh build/test mới dùng lockfile đã cập nhật.

## Lịch sử dashboard trước M2 — 23/10/2026

Đợt trước M2 dùng điều hướng trên và sidebar gọn. M2 đã thay bằng Framed sheet có sidebar nhãn và thanh công cụ 48 px. Dashboard tiếp tục dùng danh mục dự án/bảng thật, tải thêm và lỗi/thử lại; không suy tiến độ hoàn thành hay số việc từ dữ liệu chưa đủ. Báo cáo cũ được giữ làm lịch sử.

## Trạng thái sau Mốc D và dashboard — 23/10/2026

Build đạt; 200 test trong 15 file đạt với `npm test -- --maxWorkers=2`. Lint còn 19 lỗi cũ và 0 cảnh báo, không có chẩn đoán mới. Vite còn cảnh báo bundle JS lớn hơn 500 kB; tối ưu/chia bundle thuộc G04. A/B đã ghi nhận 38 cảnh báo phụ thuộc; đợt này không thay dependency hoặc chạy lại audit.

Xem [kết quả dashboard và ảnh kiểm tra](../docs/frontend-modernization/10-dashboard-redesign-results.md) để biết phạm vi UI, hệ màu và giới hạn xác minh.

Xem [báo cáo Mốc A](../docs/frontend-modernization/06-milestone-a-results.md), [báo cáo Mốc B](../docs/frontend-modernization/07-milestone-b-results.md), [báo cáo Mốc C](../docs/frontend-modernization/08-milestone-c-results.md) và [báo cáo Mốc D](../docs/frontend-modernization/09-milestone-d-results.md) để biết thay đổi, lệnh, nợ lint và giới hạn. Build/test đạt không thay thế xác minh cookie/CORS với BE hoặc sửa các lỗi dữ liệu/Kanban còn lại ở E–G.

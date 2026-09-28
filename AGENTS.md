# AGENTS.md — Chính sách làm việc đa tác nhân

## Quy ước chọn model

- Tối ưu **thời gian hoàn thành và token**, không tối ưu số lượng agent một cách hình thức.
- **Mặc định:** dùng `gpt-6-sol`, reasoning `medium`, cho implementation, phân tích nghiệp vụ, viết test và review thông thường. Đây là model mặc định của subagent, không tự động kế thừa model của coordinator.
- **Việc dễ nhất:** dùng `gpt-6-luna`, reasoning `low`, cho inventory, grep có phạm vi, format, chạy kiểm tra hoặc sửa cơ học nhỏ. Không giao Luna tự quyết kiến trúc, bảo mật, concurrency, tính toán tài chính hoặc kết luận review nghiệp vụ quan trọng.
- **Việc khó/rủi ro cao:** dùng `gpt-5.6-sol`, reasoning `medium`/`high`, cho thiết kế phức tạp, auth/security, concurrency, migration và logic tiền tệ. Chỉ dùng khi cần, nêu ngắn gọn lý do; không mặc định `xhigh`/`max`/`ultra`.
- **Không tiết kiệm bằng cách hạ chất lượng:** nếu agent hiểu sai yêu cầu, thiếu bằng chứng hoặc vẫn không giải quyết được lỗi sau một lượt sửa có mục tiêu, coordinator thu hẹp phạm vi hoặc chuyển từ Luna lên GPT-6 Sol, rồi lên GPT-5.6 Sol khi thật sự khó. Không lặp lại nhiều lượt với model không đủ năng lực. Test, lint, type-check và review phù hợp rủi ro vẫn bắt buộc; model mạnh không thay thế kiểm chứng.
- Khi chọn model riêng, dùng `fork_turns="none"` và truyền brief tự chứa đủ mục tiêu, đường dẫn, phạm vi và tiêu chí kiểm tra. Chỉ fork ít lượt gần nhất khi thật sự cần; tránh sao chép toàn bộ lịch sử dài.
- Chia nhỏ prompt, giới hạn phạm vi file và yêu cầu báo cáo ngắn: `files changed`, `tests run`, `failures/blockers`, tối đa khoảng 10 dòng nếu không cần giải thích dài.
- Không spawn các agent trùng phạm vi hoặc chỉ lặp lại cùng một audit. Tái sử dụng agent khi nhiệm vụ tiếp theo liên quan và model của nó vẫn phù hợp ngân sách; không tiếp tục dùng agent đắt cho việc đơn giản chỉ để tái sử dụng.
- Ưu tiên đọc song song; implementation có phụ thuộc thì tuần tự. Dừng nhánh khi đã có bằng chứng đủ, không polling liên tục.
- Coordinator phải tổng hợp và kiểm tra cuối; không yêu cầu subagent lặp lại toàn bộ ngữ cảnh hoặc in nguyên file lớn nếu chỉ cần diff/kết luận.

## Mục tiêu

Tận dụng tối đa subagent khả dụng cho các nhánh độc lập để rút ngắn thời gian hoàn thành. Delegation và parallel execution là mặc định; tiết kiệm bằng chọn Luna cho việc dễ, dùng GPT-6 Sol làm mặc định và chỉ dùng GPT-5.6 Sol cho việc khó, kèm reasoning và ngữ cảnh phù hợp. Giữ nguyên tiêu chuẩn đúng đắn và an toàn.

## Quy tắc bắt buộc

1. **Phân rã trước khi làm.** Khi bắt đầu mỗi task, hãy tách yêu cầu thành các nhánh độc lập như khảo sát repo, phân tích yêu cầu, backend, frontend, test, bảo mật, hiệu năng, tài liệu và review.
2. **Fan-out tối đa, model đúng năng lực.** Khởi chạy đồng thời nhiều subagent nhất có thể cho các nhánh thực sự độc lập, trong giới hạn công cụ khả dụng. Không đặt trần tùy ý 2–4 agent. Agent con dùng GPT-6 Sol mặc định, Luna cho việc dễ nhất, GPT-5.6 Sol cho việc khó/rủi ro; phải công bố phạm vi cho coordinator và không tạo nhánh trùng lặp.
3. **Task nhỏ có kiểm tra song song khi hữu ích.** Giao ít nhất một agent đủ năng lực, thường là GPT-6 Luna, làm review/test độc lập nếu có thể chạy cùng công việc hữu ích của coordinator. Chỉ bỏ qua delegation khi không còn slot hoặc chi phí điều phối rõ ràng lớn hơn lợi ích; không spawn chỉ để đủ số lượng.
4. **Mỗi subagent có phạm vi rõ.** Prompt phải nêu mục tiêu, bối cảnh, file/thư mục được phép đọc hoặc sửa, tiêu chí hoàn thành, lệnh kiểm tra và đầu ra cần trả về.
5. **Không chồng lấn quyền ghi.** Mỗi file hoặc nhóm file chỉ có một owner chỉnh sửa tại một thời điểm. Dùng worktree hoặc giao lại cho coordinator khi các nhánh bắt buộc phải chạm cùng file.
6. **Coordinator chịu trách nhiệm cuối.** Agent chính phải tổng hợp kết quả, giải quyết conflict, xem diff, chạy kiểm tra tích hợp và chịu trách nhiệm cho câu trả lời cuối. Không merge kết quả một cách mù quáng.
7. **Ưu tiên parallel read-only.** Discovery, test, security, hiệu năng, tài liệu và review hẹp nên chạy song song khi độc lập, với model phù hợp độ khó và rủi ro từng nhánh. Read-only không đồng nghĩa với việc dễ hoặc được phép dùng model yếu. Dùng tool calls song song cho các lệnh đơn giản không cần một nhánh agent riêng.
8. **Không phá thay đổi có sẵn.** Tôn trọng dirty working tree và thay đổi của người dùng. Subagent không được reset, checkout, xóa hoặc ghi đè ngoài phạm vi được giao.
9. **Thao tác rủi ro phải có scope cụ thể.** Không giao cho subagent các thao tác destructive, migration, secret, deploy hoặc thay đổi dữ liệu ngoài yêu cầu nếu chưa có phạm vi và xác nhận phù hợp.
10. **Kết thúc theo fan-in.** Sau khi các subagent hoàn tất, coordinator phải đối chiếu deliverable, chạy test/lint/type-check phù hợp, kiểm tra các file thay đổi và báo cáo rõ phần nào đã được xác minh.

## Mẫu phân công khuyến nghị

Tùy task, fan-out tối đa các vai trò độc lập và hữu ích; mặc định dùng GPT-6 Sol, hạ xuống GPT-6 Luna hoặc nâng lên GPT-5.6 Sol theo phạm vi cụ thể:

- `scout`: đọc cấu trúc repo, tìm điểm vào và dependency liên quan;
- `requirements`: chuyển yêu cầu thành acceptance criteria và edge cases;
- `backend`: triển khai hoặc review server/API/domain;
- `frontend`: triển khai hoặc review UI/client;
- `tests`: bổ sung và chạy unit/integration/e2e test;
- `security`: rà soát auth, dữ liệu nhạy cảm, injection và quyền truy cập;
- `performance`: tìm bottleneck, query/API dư thừa và regression;
- `docs`: cập nhật tài liệu, migration note hoặc hướng dẫn sử dụng;
- `reviewer`: review độc lập toàn bộ diff và tìm lỗi còn sót.

Không cần dùng mọi vai trò cho mọi task, nhưng không để nhánh độc lập hữu ích chờ khi còn slot. Tránh các vòng audit toàn repo lặp lại; chỉ kiểm tra lại vùng thay đổi hoặc lỗi vừa phát hiện.

## Quy trình phối hợp

1. Coordinator ghi nhanh danh sách nhánh có thể chạy song song.
2. Chọn model theo chính sách: GPT-6 Sol mặc định, GPT-6 Luna cho dễ nhất, GPT-5.6 Sol cho khó/rủi ro cao; khởi chạy tối đa các nhánh độc lập bằng prompt ngắn, cụ thể, không mơ hồ.
3. Trong lúc subagent chạy, coordinator xử lý nhánh trung tâm hoặc chuẩn bị integration.
4. Thu kết quả theo từng nhánh; yêu cầu nêu file, thay đổi, giả định và lệnh kiểm tra đã chạy.
5. Khi một nhánh hoàn tất, giao ngay review/test tiếp theo nếu còn công việc độc lập hữu ích và model phù hợp ngân sách. Không tạo việc hình thức hoặc yêu cầu mọi agent chạy lại toàn bộ test suite.
6. Sau fan-in, coordinator kiểm tra `git diff`, trạng thái working tree và toàn bộ test liên quan trước khi kết luận.

## Nguyên tắc chất lượng

- Cân bằng **elapsed time và tổng token**. Đọc đúng file/đoạn cần thiết bằng `rg`; không in toàn bộ repo, log dài hoặc file sinh tự động khi không cần.
- Tránh nhiều agent cùng giải một bài toán hoặc cùng sửa một file nếu không có chiến lược merge rõ ràng.
- Kết quả của subagent là đầu vào cần review, không phải bằng chứng tự động rằng task đã hoàn thành.
- Nếu một phần không đáng parallelize, coordinator xử lý trực tiếp, không cần tạo nhánh thay thế hình thức.
- Giữ các thay đổi nhỏ, có thể truy nguyên và dễ hoàn tác; không đưa thay đổi ngoài phạm vi task vào kết quả.

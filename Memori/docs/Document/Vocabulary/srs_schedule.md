---
date: 2026-06-01
---
# Thuật toán Spaced Repetition (SRS) Cực đoan

Khác với các hệ thống SRS truyền thống (như Anki hay SuperMemo) phụ thuộc vào việc người dùng tự đánh giá (Dễ, Khó, Quên) hoặc tính toán dựa trên thời gian/số lần dùng Hint, hệ thống của chúng ta áp dụng một **Lộ trình Cố định Cực đoan (Hardcore Fixed Schedule)**.

## 1. Lý do áp dụng phương pháp Cực đoan

1. **Loại bỏ Yếu tố Cảm xúc (Emotion Bias):** Con người không giỏi tự đánh giá chính mình. Việc một từ hôm nay khó nhớ có thể do người dùng đang mệt mỏi, buồn ngủ, hoặc do từ đó bị ghép chung với quá nhiều từ khó khác trong một câu Super Sentence, chứ không hẳn là họ thực sự "quên" từ đó.
2. **Đảm bảo Khắc sâu Vĩnh viễn (Guaranteed Permanent Retention):** Bằng cách áp đặt một lịch trình lặp lại dày đặc có chủ đích, một khi người dùng hoàn thành lộ trình, từ vựng đó chắc chắn đã đi vào bộ nhớ dài hạn, không cần phải ôn lại nữa.
3. **Giảm tải thao tác (Zero-friction UI):** Người dùng chỉ việc gõ từ. Không cần phải chọn nút "Dễ / Khó / Quên" sau mỗi lần ôn, giúp luồng chơi Story Review diễn ra cực kỳ trơn tru và tập trung vào cốt truyện.

---

## 2. Lộ trình Ôn tập (The Schedule Array)

Thuật toán sử dụng một mảng hằng số (Constant Array) lưu trữ số ngày chờ cho lần ôn tiếp theo. Mỗi từ vựng sẽ lưu một biến `step_index` (bắt đầu từ 0).

**Mảng Lộ trình Hằng số (Tính bằng Ngày):**
```javascript
const SRS_SCHEDULE = [
  1, 1, 1, 1, 1,     // Khởi động: 5 ngày liên tiếp
  2, 1, 1,           // Ngắt nhịp lần 1: Nghỉ 2 ngày, ôn 2 ngày liên tiếp
  4, 1, 1,           // Ngắt nhịp lần 2: Nghỉ 4 ngày, ôn 2 ngày liên tiếp
  8, 1, 1,           // Ngắt nhịp lần 3: Nghỉ 8 ngày, ôn 2 ngày liên tiếp
  20, 1, 1, 1,       // Ngắt nhịp lần 4: Nghỉ 20 ngày, ôn 3 ngày liên tiếp
  60, 1, 1, 1,       // Ngắt nhịp lần 5: Nghỉ 2 tháng, ôn 3 ngày liên tiếp
  150, 1, 1, 1       // Chốt hạ: Nghỉ 5 tháng, ôn 3 ngày liên tiếp -> Tốt nghiệp!
];
```

Tổng cộng có **26 bước (steps)**. 
- Tổng thời gian lộ trình nếu không bỏ sót ngày nào: Khoảng ~260 ngày.
- Khi `step_index >= SRS_SCHEDULE.length`, từ vựng chuyển sang trạng thái **"Mastered" (Đã làm chủ vĩnh viễn)** và bị loại khỏi vòng lặp ôn tập.

---

## 3. Cấu trúc Dữ liệu (Database Schema)

Trong Database (bảng `User_Vocabulary`), mỗi từ vựng sưu tầm sẽ cần các trường sau để phục vụ thuật toán:

```json
{
  "word_id": "uuid",
  "hz": "开门",
  "py": "kāi mén",
  "vn": "mở cửa",
  "source_sentence": "A! Em sợ lắm, anh đừng mở cửa!",
  "status": "learning", // 'learning' | 'mastered'
  "step_index": 0,      // Vị trí hiện tại trong mảng SRS_SCHEDULE
  "next_review_date": 1782500000000 // Timestamp của ngày ôn tiếp theo
}
```

---

## 4. Logic Hoạt động (State Transition)

1. **Khi thu thập từ mới:**
   - Thêm vào DB với `step_index = 0`.
   - `next_review_date = Start of Tomorrow` (Bắt đầu ôn vào ngày mai).

2. **Mỗi ngày, khi vào Ôn tập (Story Review):**
   - Query DB lấy tất cả các từ có `next_review_date <= current_date` và `status == 'learning'`.
   - Đưa vào Hàng đợi Động (Dynamic Word Queue) để nhét vào Story.

3. **Sau khi ôn thành công (Kết thúc Session):**
   - Lặp qua danh sách từ vựng vừa ôn xong.
   - Với mỗi từ:
     - Lấy số ngày nghỉ từ mảng: `days_to_wait = SRS_SCHEDULE[step_index]`.
     - Cập nhật `next_review_date = current_date + (days_to_wait * 24 * 60 * 60 * 1000)`.
     - Tăng chỉ mục: `step_index += 1`.
     - Nếu `step_index >= SRS_SCHEDULE.length`, set `status = 'mastered'`.

4. **Xử lý lỡ hẹn (Missed Days):**
   - Do thiết kế của mảng này là một chuỗi ép buộc tịnh tiến, nếu người dùng bỏ lỡ nhiều ngày không vào app, hệ thống chỉ đơn giản là gộp các từ bị lỡ hạn vào mẻ ôn tập của ngày hôm nay (`next_review_date <= current_date`).
   - *Không có cơ chế phạt (penalty) lùi step*. Người dùng chỉ cần học tiếp theo đúng mảng quy định. Điều này rất phù hợp với tâm lý học vì người dùng không bị "phạt" khi lười biếng, giữ cho họ không bị nản khi quay lại app sau một thời gian dài.

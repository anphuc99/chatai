---
date: 2026-06-01
---
# Tính năng Ôn tập Từ vựng: Truyện ngắn Tương tác (Interactive Story Review)

Đây là một ý tưởng cực kỳ xuất sắc và mang tính đột phá! Thay vì bắt người dùng học vẹt từng từ đơn lẻ, chúng ta ném họ vào một **"Mini-Story" (Truyện ngắn)** hoàn toàn mới. Narrator (Người dẫn chuyện) sẽ dẫn dắt cốt truyện bằng tiếng Việt, và người dùng đóng vai trò là "người lấp đầy khoảng trống" bằng cách dịch các câu chốt (chứa từ vựng đã học) sang tiếng Trung để câu chuyện được tiếp tục.

Dưới đây là bản thiết kế chi tiết cho tính năng này.

---

## 1. Luồng Hoạt Động (User Flow)

1. **Khởi tạo mini-story**: Hệ thống (AI) random chọn ra khoảng 5-10 từ vựng mà người dùng cần ôn tập. AI sẽ tự động sáng tác một kịch bản truyện ngắn gọn, hài hước hoặc kịch tính có thể nhồi nhét hợp lý các từ vựng này.
2. **Kể chuyện (Tiếng Việt)**: Narrator bắt đầu kể chuyện trên màn hình UI giống như giao diện chat.
3. **Thử thách xuất hiện**: Đến đoạn cao trào, Narrator dừng lại và yêu cầu người dùng hoàn thành hành động tiếp theo của nhân vật bằng cách gõ tiếng Trung. 
   - *Ví dụ: "Hãy gõ: 'Cô giáo đã mở cửa lớp' để tiếp tục."*
4. **Cơ chế Gợi ý (Hint System - Bóng đèn 💡)**:
   - Hệ thống bắt đầu đếm ngược ngầm 10 giây.
   - Nếu người dùng chưa gõ xong hoặc không có tương tác, một icon **Bóng đèn 💡** phát sáng sẽ nảy lên bên cạnh ô nhập liệu.
   - Khi bấm vào Bóng đèn, một pop-up nhỏ hiện ra chứa các từ vựng (Chữ Hán) bị **xáo trộn vị trí (Scrambled Words)**. Ví dụ: `[门] [了] [老师] [开]`.
   - Người dùng nhìn vào các thẻ từ bị xáo trộn này để nhớ lại mặt chữ, cấu trúc ngữ pháp và gõ (hoặc bấm chọn từng thẻ để ghép thành câu).
5. **Vượt qua thử thách**: Sau khi hệ thống check câu trả lời chính xác, một hiệu ứng thành công (Confetti 🎉) nổ ra. Narrator tiếp tục câu chuyện dựa trên hành động người dùng vừa nhập.

---

## 2. Ví dụ Kịch bản Trải nghiệm (Demo Thực tế)

**[Từ vựng mục tiêu cần ôn trong bài]**: 老师 (Cô giáo), 开门 (Mở cửa), 害怕 (Sợ hãi), 跑 (Chạy), 为什么 (Tại sao).

**(Giao diện mở ra, âm thanh nhạc nền hơi hồi hộp...)**

**Narrator** *(in nghiêng, chữ xám)*:
> "Trời đã tối muộn, Tiểu Minh để quên cuốn sổ bài tập ở lớp nên phải quay lại trường lấy. Hành lang trường học tối om, vắng lặng không một bóng người."

**Narrator**:
> "Cậu bé vừa đi vừa run. Đột nhiên, từ phòng học số 3 ở cuối hành lang phát ra tiếng sột soạt. Tiểu Minh lấy hết can đảm bước tới. Đúng lúc đó..."

**Narrator (Nhiệm vụ 1)**:
> 🎯 **Nhiệm vụ của bạn:** Hãy gõ câu sau bằng tiếng Trung để tiếp tục: *"Cô giáo mở cửa."* (Sử dụng các từ đã học: 老师, 开门)

*(Người dùng đang ở ô Input. Thời gian trôi qua 10 giây... Icon Bóng đèn 💡 rung lắc xuất hiện)*

*(Người dùng bấm vào 💡. Hệ thống hiện thẻ gợi ý xáo trộn)*: 
`[门] [老师] [开] [了]`

*(Người dùng gõ vào ô chat)*:
**User**: `老师开门了。`

**(Hệ thống báo True ✅, âm thanh *Ting* vang lên, truyện tiếp tục...)**

**Narrator**:
> "Cánh cửa kẽo kẹt mở ra. Ánh trăng hắt vào phòng, đứng đó không phải là ma, mà chính là cô giáo chủ nhiệm Vương đang tìm đồ!"

**Narrator**:
> "Tiểu Minh giật mình lùi lại một bước, tim đập thình thịch."

**Narrator (Nhiệm vụ 2)**:
> 🎯 **Nhiệm vụ của bạn:** Hãy gõ câu sau: *"Tiểu Minh rất sợ hãi."* (Từ vựng: 害怕)

*(Người dùng gõ ngay lập tức vì nhớ từ)*:
**User**: `小明很害怕。`

**Narrator**:
> "Cô Vương thấy Tiểu Minh thì ngạc nhiên hỏi: 'Muộn thế này rồi em còn ở đây làm gì?' Tiểu Minh bối rối đáp: 'Em quên vở ạ.' Cô Vương mỉm cười dịu dàng đưa cuốn vở cho cậu."

**Narrator (Nhiệm vụ 3 - Kết hợp nhiều từ)**:
> 🎯 **Nhiệm vụ của bạn:** Tiểu Minh nhận lấy cuốn vở rồi quay đầu ù té chạy. Hãy gõ: *"Tại sao Tiểu Minh chạy?"* (Từ vựng: 为什么, 跑)

*(Người dùng bấm Bóng đèn 💡)*:
`[小明] [跑] [什么] [为]`

*(Người dùng gõ)*:
**User**: `小明为什么跑？`

**Narrator**:
> "Tại sao Tiểu Minh chạy á? Vì cậu ấy sực nhớ ra... cô giáo Vương đã xin nghỉ ốm từ tuần trước rồi mà!!! 😱"

*(Kết thúc câu chuyện)*

---

## 3. Lợi ích của phương pháp này

1. **Active Recall (Gợi nhớ chủ động)**: Ép người dùng phải truy xuất từ vựng từ trong đầu ra (thay vì chỉ nhìn mặt chữ rồi đoán nghĩa như trắc nghiệm).
2. **Contextual Learning (Học qua ngữ cảnh)**: Từ vựng được liên kết mạnh mẽ với hình ảnh, cảm xúc và tình huống của câu chuyện (cô giáo, đêm tối, ma quái), giúp não bộ lưu trữ vào bộ nhớ dài hạn tốt hơn gấp 10 lần.
3. **Grammar Practice (Luyện ngữ pháp)**: Thông qua việc xếp các thẻ từ bị xáo trộn (Scrambled Words) từ Hint, người dùng học luôn cả cấu trúc câu tiếng Trung một cách tự nhiên.
4. **Gây nghiện (Addictive)**: Người dùng muốn hoàn thành việc gõ từ vựng không hẳn vì "phải học", mà vì tò mò muốn biết diễn biến tiếp theo của câu chuyện sẽ như thế nào.

## 5. Giải pháp cho Vấn đề Số lượng lớn (Scaling Problem): Cơ chế "Super Sentence" (Câu Siêu Combo)

Góc nhìn của bạn về tâm lý học hành vi rất chính xác! Việc chia ra quá nhiều chương (ví dụ 20 chương cho 200 từ) sẽ tạo ra "điểm dừng" khiến người dùng dễ dàng thoát app vì cảm thấy đã "hoàn thành một nhiệm vụ", và nhìn chặng đường 19 chương còn lại sẽ rất nản.

Để giải quyết triệt để việc ôn 200 từ mà không kéo dài lê thê, chúng ta sẽ áp dụng chiến lược **"Super Sentence" (Câu Siêu Combo)**:

### A. Thuật toán Độ dài Câu thích ứng (Adaptive Sentence Length)
Độ dài của một "Super Sentence" không cố định mà sẽ tự động co giãn tùy thuộc vào số lượng từ vựng cần ôn trong ngày và trình độ của người dùng:
- **Ngưỡng Thấp (30 - 50 từ)**: Thường là người mới hoặc từ mới học. Một câu ghép chỉ nên chứa **3 - 5 từ vựng**. Trọng tâm là dễ hiểu và nắm bắt ngữ cảnh tốt.
- **Ngưỡng Cao (100 - 300 từ)**: Đa số là từ cũ đã quen thuộc (quán tính nhớ cao). Một câu ghép sẽ nhồi **10 - 20 từ vựng**. Rút ngắn triệt để thời gian ôn tập mà vẫn đảm bảo tính thử thách ghép câu dài.

### B. Thử thách Xếp hình (Puzzle Mode) cho Super Sentence
Gõ một câu chứa 20 từ tiếng Trung là một thử thách rất khó nếu phải tự nhớ. Vì vậy, cơ chế Hint (💡) lúc này sẽ đóng vai trò như một **Mini-game Xếp hình (Puzzle)**:
- Người dùng bấm 💡, hệ thống đổ ra 20-25 thẻ từ bị xáo trộn.
- Dựa vào câu tiếng Việt của Narrator, người dùng phải suy luận logic ngữ pháp tiếng Trung để "chọn và ghép" các thẻ từ này thành một câu dài hoàn chỉnh (giống format của Duolingo ở các level khó).
- Việc này giúp biến sự mệt mỏi khi gõ chữ thành sự hứng thú giải đố.

### C. Kiểm duyệt chặt chẽ bằng JSON (Strict Verification)
Dù nhồi 20 từ vào một câu, AI đôi khi vẫn có thể bỏ sót. 
- Prompt sẽ yêu cầu AI trả về mảng `used_words` chứa chính xác các từ nó đã nhúng vào Super Sentence đó.
- Nếu AI dùng 18/20 từ, Client sẽ tự động lấy 2 từ bị sót cộng dồn vào "Super Sentence" tiếp theo của cốt truyện.

### D. Kết hợp "Ôn siêu tốc" (Tinder Swipe)
Dù có Super Sentence, việc làm 10 câu ghép siêu dài vẫn tốn năng lượng. Hệ thống nên cho người dùng quyền chọn lựa trước khi bắt đầu:
1. **Flash Review (Ôn siêu tốc)**: Dạng quẹt thẻ trái/phải cực nhanh để lướt qua 200 từ trong 5 phút.
2. **Deep Story Mode (Siêu Combo)**: Dành cho những lúc người dùng có thời gian và muốn rèn luyện kỹ năng tư duy ngữ pháp ghép câu dài.

## 6. Kiến trúc Kỹ thuật & Quản lý Trạng thái

Dựa trên kiến trúc hệ thống hiện tại, luồng kỹ thuật của Story Review sẽ được thiết kế để tối ưu token và lưu trữ an toàn:

### A. Quản lý Hàng đợi Từ vựng Động (Dynamic Word Queue)
Client là người nắm giữ danh sách `words_to_review` tổng. 
- Ở mỗi lượt chat, Client gửi một mẻ từ (tùy theo thuật toán độ dài) lên cho AI.
- AI sinh ra câu chuyện chứa các từ đó và trả về `used_words` trong JSON.
- Client đối chiếu `used_words` với danh sách gửi đi. Các từ đã được dùng thành công sẽ bị loại khỏi hàng đợi. Các từ bị sót (AI quên dùng) hoặc chưa tới lượt sẽ được Client **gửi liên tục vào Prompt của lượt chat tiếp theo**. Quá trình lặp lại cho đến khi hàng đợi rỗng.

### B. Lưu trữ Tạm thời (Local JSONL Cache) & Không lưu DB
Khác với phòng chat Story chính, phiên "Ôn tập" chỉ mang tính rèn luyện.
- **Bảo vệ tiến trình**: Sử dụng cơ chế lưu đệm giống `history_store.md`. Mọi lượt chat được append nối tiếp vào file `vocab_session.jsonl`. Nếu user đang ôn 200 từ mà lỡ tay tắt app, khi mở lại hệ thống sẽ đọc file `.jsonl` này để khôi phục tiến trình, user không phải ôn lại từ đầu.
- **Không lưu vĩnh viễn**: Khi session kết thúc (hàng đợi rỗng), hệ thống cập nhật trạng thái "Đã ôn tập" cho các từ vựng đó trong Database, sau đó **XÓA BỎ** file `vocab_session.jsonl`. Không bàn giao lịch sử truyện ngắn này sang module Journal để tránh làm rác Database.

### C. Quản lý Token & Tóm tắt (Summary Checkpoints)
Nếu người dùng phải ôn 200 từ, câu chuyện có thể kéo dài tới 20-30 lượt tương tác, dẫn đến tràn giới hạn Token (Context Window).
- Áp dụng cơ chế Checkpoint tương tự `message_chat.md` và `history_store.md`.
- Khi số token vượt ngưỡng (vd: `MAX_HISTORY_TOKENS`), hệ thống kích hoạt luồng **Small AI** chạy ngầm để đọc lịch sử cũ và tạo một bản **Tóm tắt (Summary)**.
- Bản tóm tắt này được ghi vào file `.jsonl` dưới dạng `{"role": "checkpoint", "summary": "..."}`.
- Các lượt chat sau đó AI chỉ nhận [Summary] + [5 lượt chat cuối] + [Danh sách từ chưa ôn], giúp hệ thống vận hành cực kỳ mượt mà, không giật lag dù ôn bao nhiêu từ đi chăng nữa.

## 7. Mẫu Prompt (System Prompt Template)

Dưới đây là mẫu System Prompt cấu hình cho LLM (Ollama) để đóng vai Narrator sinh ra kịch bản truyện và trả về định dạng JSON chuẩn cho UI.

### 7.1. Cấu trúc Prompt Gửi đi

```text
[SYSTEM]
Bạn là một Người dẫn chuyện (Narrator) sáng tạo trong một trò chơi tương tác học tiếng Trung. 
Nhiệm vụ của bạn là tiếp tục kể một câu chuyện ngắn (bằng tiếng Việt) thật kịch tính, hài hước hoặc lôi cuốn.

Ở mỗi lượt, bạn sẽ nhận được một danh sách TỪ VỰNG TIẾNG TRUNG BẮT BUỘC. 
Bạn phải sáng tác tình huống sao cho nhân vật chính sắp sửa nói hoặc làm một hành động có chứa toàn bộ các từ vựng này.
Sau đó, bạn dừng câu chuyện lại và yêu cầu người chơi phải tự dịch câu hành động đó sang tiếng Trung để câu chuyện được đi tiếp.

[INPUT RULES]
1. Bắt buộc sử dụng TOÀN BỘ danh sách từ vựng được truyền vào ở mỗi lượt (Input).
2. Số lượng câu tiếng Trung yêu cầu: {số_lượng_câu} câu.
3. Hãy tạo ra đoạn tiếng Trung (Target Sentence(s)) có độ dài đúng bằng {số_lượng_câu} câu, chứa toàn bộ các từ vựng từ Input một cách tự nhiên và đúng ngữ pháp.
4. Chia nhỏ toàn bộ đoạn Target Sentence thành các từ/cụm từ rời rạc và xáo trộn vị trí của chúng để tạo thành mảng `scrambled_cards` (dùng cho tính năng ghép thẻ xếp hình).
5. Phản hồi CHỈ BẰNG JSON theo đúng định dạng sau, không thêm bất kỳ văn bản nào khác.

[JSON SCHEMA EXPECTED]
{
  "narrator_text": "Đoạn văn kể chuyện bằng tiếng Việt dẫn dắt tình huống (khoảng 2-3 câu).",
  "task_instruction": "Câu giao nhiệm vụ, ví dụ: 'Hãy gõ câu sau bằng tiếng Trung để tiếp tục:'",
  "target_vietnamese": "Đoạn tiếng Việt (tương ứng với {số_lượng_câu} câu) mà người dùng cần dịch.",
  "target_chinese": "Đáp án tiếng Trung (Gồm {số_lượng_câu} câu, chứa toàn bộ từ vựng yêu cầu).",
  "used_words": ["Danh", "sách", "các", "từ", "vựng", "đã", "dùng", "thành", "công"],
  "scrambled_cards": [
    {"hz": "từ_1", "py": "pinyin_1"},
    {"hz": "từ_2", "py": "pinyin_2"}
  ] // Danh sách các thẻ từ bị xáo trộn vị trí (Bao gồm cả các từ ngữ pháp phụ trợ để ghép thành câu hoàn chỉnh).
}

[EXAMPLE]
Input: ["害怕", "门", "老师"]

Output:
{
  "narrator_text": "Hành lang trường học tối om, vắng lặng không một bóng người. Đột nhiên, từ phòng học số 3 ở cuối hành lang phát ra tiếng sột soạt.",
  "task_instruction": "Hãy dịch câu sau sang tiếng Trung để biết ai đang tới:",
  "target_vietnamese": "Cô giáo đã mở cửa, Tiểu Minh rất sợ hãi.",
  "target_chinese": "老师开门了，小明很害怕。",
  "used_words": ["老师", "开门", "害怕"],
  "scrambled_cards": [
    {"hz": "害怕", "py": "hàipà"},
    {"hz": "门", "py": "mén"},
    {"hz": "了", "py": "le"},
    {"hz": "老师", "py": "lǎoshī"},
    {"hz": "很", "py": "hěn"},
    {"hz": "开", "py": "kāi"},
    {"hz": "小明", "py": "xiǎomíng"}
  ]
}
```

### 7.2. Ví dụ AI Trả về (JSON Payload)

Khi Client truyền vào `["害怕", "门", "老师"]`, AI sẽ trả về:

```json
{
  "narrator_text": "Hành lang trường học tối om, vắng lặng không một bóng người. Đột nhiên, từ phòng học số 3 ở cuối hành lang phát ra tiếng sột soạt. Có tiếng bước chân đang tiến lại gần...",
  "task_instruction": "Nhiệm vụ: Hãy dịch câu sau sang tiếng Trung để biết ai đang tới!",
  "target_vietnamese": "Cô giáo đã mở cửa, Tiểu Minh rất sợ hãi.",
  "target_chinese": "老师开门了，小明很害怕。",
  "used_words": ["老师", "开门", "害怕"],
  "scrambled_cards": [
    {"hz": "害怕", "py": "hàipà"},
    {"hz": "门", "py": "mén"},
    {"hz": "了", "py": "le"},
    {"hz": "老师", "py": "lǎoshī"},
    {"hz": "很", "py": "hěn"},
    {"hz": "开", "py": "kāi"},
    {"hz": "小明", "py": "xiǎomíng"}
  ]
}
```
*Lưu ý: Mảng `scrambled_cards` không chỉ chứa 3 từ khóa chính, mà AI còn tự sinh thêm các từ phụ (了, 很, 小明) và trộn đều chúng lên để tạo thành một bộ xếp hình hoàn chỉnh cho UI `vocab_review.html` dựng hình.*

# WorkPlan — Chi tiết Implementation cho từng Task

> **Mục đích**: Mỗi file `P{phase}_T{n}_*.md` là blueprint **đầy đủ logic** để bắt tay vào code mà không phải suy nghĩ kiến trúc nữa. Không có code dòng nào — chỉ có spec.

---

## Quy ước cấu trúc mỗi file Workplan

Mỗi file gồm 7 sections cố định:

### 1. METADATA
- **Task ID**: P{phase}.T{n}
- **Tên task**: ngắn gọn
- **Phase**: thuộc phase nào
- **Depends on**: task tiền điều kiện
- **Estimated complexity**: Low / Medium / High
- **Risk level**: Low / Medium / High

### 2. MỤC TIÊU & SCOPE
- Mô tả bằng văn xuôi: task này làm gì, không làm gì
- Boundary rõ ràng (in-scope vs out-of-scope)

### 3. FILES CẦN TẠO / SỬA
Bảng liệt kê:
| # | Path tuyệt đối tương đối từ root | Loại | Mục đích |

### 4. CLASS DIAGRAM (Mermaid)
Sơ đồ class UML chuẩn cho task — tất cả class trong task + relationships.

### 5. CHI TIẾT TỪNG CLASS
Cho mỗi class:
- **Vai trò** (1-2 câu)
- **Properties** bảng: tên | type | mô tả | access modifier
- **Methods** bảng đầy đủ:
  - Tên method
  - Signature (input params với type)
  - Return type
  - Mô tả logic step-by-step (bullet list)
  - Side effects (DB write, Redis, event emit, etc.)
  - Exceptions có thể throw
  - Complexity (Time/Space nếu cần)

### 6. SEQUENCE DIAGRAM (Mermaid)
Sơ đồ tương tác giữa các class/method cho 1-3 luồng chính của task.

### 7. ACCEPTANCE & TEST PLAN
- **Acceptance criteria**: bullet list kiểm chứng được
- **Unit tests** cần viết
- **Integration tests** cần viết
- **Manual test steps**

---

## Cấu trúc thư mục WorkPlan/

```
WorkPlan/
├── README.md                              (file này)
├── _conventions.md                        (naming, coding style, error codes)
│
├── P00_T1_monorepo_setup.md
├── P00_T2_nestjs_skeleton.md
├── P00_T3_expo_skeleton.md
├── P00_T4_docker_dev_services.md
├── P00_T5_prisma_orm_setup.md
├── P00_T6_redis_module.md
├── P00_T7_logger_error_tracing.md
├── P00_T8_github_actions_ci.md
│
├── P01_T1_firebase_project_setup.md
├── P01_T2_server_auth_module.md
├── P01_T3_server_users_module.md
├── P01_T4_client_google_signin.md
├── P01_T5_client_profile_screen.md
├── P01_T6_client_navigation.md
├── P01_T7_shared_types_package.md
│
... (tương tự cho P02 → P13)
```

---

## Tiến độ tạo file

| Phase | Status | Files |
|-------|--------|-------|
| P00 | 🔄 In progress | 0/8 |
| P01 | ⏳ Pending | 0/7 |
| P02 | ⏳ Pending | 0/6 |
| P03 | ⏳ Pending | 0/5 |
| P04 | ⏳ Pending | 0/8 |
| P05 | ⏳ Pending | 0/5 |
| P06 | ⏳ Pending | 0/3 |
| P07 | ⏳ Pending | 0/5 |
| P08 | ⏳ Pending | 0/5 |
| P09 | ⏳ Pending | 0/5 |
| P10 | ⏳ Pending | 0/6 |
| P11 | ⏳ Pending | 0/6 |
| P12 | ⏳ Pending | 0/3 |
| P13 | ⏳ Pending | 0/4 |

**Tổng: 76 workplan files**

---

## Hướng dẫn sử dụng khi code

1. **Đọc file P{X}_T{Y}_*.md trước khi code task đó.**
2. Tạo files đúng theo Section 3.
3. Khai báo classes đúng theo Class Diagram (Section 4).
4. Implement từng method theo spec ở Section 5 — input/output/logic đã rõ.
5. Cross-check Sequence Diagram (Section 6) khi viết integration code.
6. Sau khi code xong, chạy test theo Section 7 để verify.

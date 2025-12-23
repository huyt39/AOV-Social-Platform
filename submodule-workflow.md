# Git Submodule – Workflow làm việc chi tiết (Chuẩn team)

Tài liệu này mô tả **workflow chuẩn khi làm việc với Git submodule**, bao gồm cả **quy trình checkout nhánh mới**, cập nhật, commit và các lưu ý quan trọng để tránh lỗi thường gặp.

---

## 1. Khái niệm nhanh

* **Submodule** là một repository Git được nhúng bên trong repository cha (parent repo).
* Parent repo **chỉ lưu commit hash** của submodule, **không lưu code trực tiếp**.
* Mỗi submodule có:

  * Repo riêng
  * Branch riêng
  * Lịch sử commit riêng

---

## 2. Clone project có submodule (lần đầu)

### Cách chuẩn (khuyến nghị)

```bash
git clone --recurse-submodules <repo-url>
```

### Nếu đã clone nhưng quên submodule

```bash
git submodule update --init --recursive
```

**Ý nghĩa:**

* `--init`: khởi tạo submodule
* `--recursive`: áp dụng cho submodule lồng nhau (nếu có)

---

## 3. Trạng thái mặc định của submodule (CỰC KỲ QUAN TRỌNG)

👉 Khi checkout submodule, Git sẽ đưa submodule về trạng thái:

```
HEAD detached at <commit-hash>
```

⛔ **Không nên code trực tiếp khi đang detached HEAD**

---

## 4. Workflow chuẩn khi CẦN CODE trong submodule

### Bước 1: Di chuyển vào thư mục submodule

```bash
cd path/to/submodule
```

---

### Bước 2: Checkout nhánh làm việc (BẮT BUỘC)

#### Trường hợp nhánh đã tồn tại

```bash
git checkout develop
```

#### Trường hợp tạo nhánh mới

```bash
git checkout -b feature/new-feature
```

📌 **Lý do:**

* Tránh commit vào detached HEAD
* Đảm bảo commit nằm trên branch rõ ràng

---

### Bước 3: Code & commit trong submodule

```bash
git status
git add .
git commit -m "feat: implement new feature"
```

---

### Bước 4: Push code submodule lên remote

```bash
git push origin feature/new-feature
```

⚠️ **Bắt buộc push trước khi quay về parent repo**

---

## 5. Cập nhật parent repo trỏ tới commit mới của submodule

### Bước 1: Quay về parent repo

```bash
cd ../../
```

### Bước 2: Kiểm tra trạng thái

```bash
git status
```

Bạn sẽ thấy dạng:

```
modified: path/to/submodule (new commits)
```

### Bước 3: Commit thay đổi submodule reference

```bash
git add path/to/submodule
git commit -m "chore: update submodule to latest commit"
```

### Bước 4: Push parent repo

```bash
git push origin main
```

---

## 6. Workflow khi CHỈ CẬP NHẬT submodule (không code)

```bash
git submodule update --remote --merge
```

Hoặc chỉ 1 submodule:

```bash
git submodule update --remote path/to/submodule
```

Sau đó commit ở parent repo:

```bash
git add path/to/submodule
git commit -m "chore: bump submodule version"
```

---

## 7. Workflow khi pull code mới từ parent repo

```bash
git pull
git submodule update --init --recursive
```

📌 Đảm bảo submodule được sync đúng commit mà parent repo yêu cầu

---

## 8. Những lỗi thường gặp & cách tránh

### ❌ Commit trong detached HEAD

**Triệu chứng:**

```bash
You are in 'detached HEAD' state
```

✅ **Cách tránh:**

```bash
git checkout <branch>
```

---

### ❌ Quên commit parent repo sau khi update submodule

**Hậu quả:**

* Team pull về không thấy code mới

✅ **Luôn nhớ:**

* Submodule commit ≠ Parent repo commit

---

### ❌ Pull parent repo nhưng submodule không đúng code

✅ Fix:

```bash
git submodule update --init --recursive
```

---

## 9. Checklist nhanh (cheat sheet)

### Khi code submodule

```text
[ ] cd submodule
[ ] checkout branch
[ ] code + commit
[ ] push submodule
[ ] quay về parent repo
[ ] commit submodule reference
[ ] push parent repo
```

---

## 10. Best practices cho team

* 📌 Luôn ghi rõ trong README:

  * Tên branch mặc định của submodule
* 📌 Không chỉnh code submodule trực tiếp trên `main`
* 📌 Hạn chế submodule lồng nhau
* 📌 Luôn review commit submodule hash trong PR

---

## 11. Lệnh hữu ích

```bash
git submodule status
git submodule foreach git status
git submodule foreach git pull
```

---

✍️ **Tài liệu này phù hợp cho:**

* Team backend / frontend
* Monorepo có shared libraries
* Dự án enterprise dùng submodule lâu dài

Nếu bạn muốn, mình có thể:

* Viết **version rút gọn 1 trang**
* Viết **README mẫu cho repo có submodule**
* Vẽ **sơ đồ workflow submodule (diagram)**

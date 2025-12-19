# Hướng Dẫn Triển Khai AWS & CI/CD (Production Ready - Custom Load Balancer)

Tài liệu này hướng dẫn chi tiết triển khai hệ thống **AOV Social Platform** lên AWS.
**Điểm đặc biệt:** Sử dụng **Nginx trên EC2** làm Load Balancer thay vì AWS ALB để tiết kiệm chi phí tối đa.

**Quy trình thực hiện:**
1.  Chuẩn bị Network & Database.
2.  Build & Push Docker Image.
3.  Deploy Backend lên ECS (để lấy IP).
4.  Cài đặt Nginx Load Balancer trỏ vào Backend.
5.  Deploy Video Worker.
6.  Setup CI/CD.

---

## Phần 1: Chuẩn Bị Tài Nguyên AWS (Infrastructure)

### 1. Networking & Security
1.  **VPC:** Sử dụng Default VPC hoặc tạo mới.
2.  **Subnets:** Tất cả sẽ chạy trên **Public Subnet** (để đơn giản hóa việc kết nối internet).
3.  **Security Groups (SG):** Vào EC2 -> Security Groups -> Create Security Group:

    *   **SG 1: `sg-nginx-lb`** (Dành cho EC2 chạy Nginx)
        *   **Inbound:**
            *   Type: HTTP (80) | Source: Anywhere (0.0.0.0/0)
            *   Type: HTTPS (443) | Source: Anywhere (0.0.0.0/0)
            *   Type: SSH (22) | Source: My IP (IP máy tính của bạn để SSH vào config)
        *   **Outbound:** All Traffic.

    *   **SG 2: `sg-backend-worker`** (Dành cho ECS Task)
        *   **Inbound:**
            *   Type: Custom TCP (8000) | Source: Custom -> Chọn `sg-nginx-lb` (Chỉ cho phép Nginx gọi vào Backend).
            *   *Lưu ý:* Nếu bạn muốn test trực tiếp Backend không qua Nginx thì tạm thời add thêm rule 8000 từ My IP.
        *   **Outbound:** All Traffic (Quan trọng để connect DB, RabbitMQ...).

    *   **SG 3: `sg-data-internal`** (Dành cho Redis/RabbitMQ)
        *   **Inbound:**
            *   Type: Custom TCP (6379) - Redis | Source: `sg-backend-worker`
            *   Type: Custom TCP (5671/5672) - RabbitMQ | Source: `sg-backend-worker`

### 2. Storage & Database & Queue
*   **S3:** Tạo 2 buckets (Raw & Processed) như hướng dẫn cũ.
*   **Redis (ElastiCache):** Tạo Redis OSS, chọn `sg-data-internal`. Nhớ Endpoint.
*   **RabbitMQ (Amazon MQ):** Tạo RabbitMQ, chọn `sg-data-internal`. Nhớ Endpoint (User/Pass).
*   **MongoDB Atlas:** Allow Access from Anywhere (0.0.0.0/0) hoặc setup Peering (đơn giản nhất là Allow All tạm thời).

---

## Phần 2: Container Registry (Docker Hub)

1.  Tạo tài khoản và Repo trên [Docker Hub](https://hub.docker.com/):
    *   `your-username/aov-backend`
    *   `your-username/aov-video-worker`
2.  Tạo **Access Token** trên Docker Hub (Account Settings -> Security) để dùng cho CI/CD sau này.

---

## Phần 3: Deploy Backend lên ECS (Để lấy IP)

Chúng ta cần chạy Backend trước để nó sinh ra địa chỉ IP, sau đó mới cấu hình Nginx trỏ vào IP đó.

### 1. Tạo Cluster
*   ECS -> Clusters -> Create Cluster.
*   Name: `aov-cluster`.
*   Infrastructure: **AWS Fargate** (Serverless).

### 2. Tạo Task Definition (Backend)
*   ECS -> Task Definitions -> Create new Task Definition.
*   **Task family:** `aov-backend-task`
*   **Infrastructure:** Fargate.
*   **Container details:**
    *   Name: `backend`
    *   Image URI: `docker.io/yourusername/aov-backend:latest` (Nhớ thay username của bạn).
    *   Container Port: **8000**.
    *   **Environment Variables:** Add đủ các biến trong `.env` Backend (MONGODB_URL, REDIS_URL, ...).

### 3. Chạy Service Backend (Deploy)
*   Vào Cluster `aov-cluster` -> Services -> Create.
*   **Deployment configuration:** Service.
*   **Family:** `aov-backend-task`.
*   **Service name:** `service-backend`.
*   **Networking:**
    *   VPC: Chọn Default VPC.
    *   Subnets: Chọn **Public Subnets**.
    *   Security Group: Chọn `sg-backend-worker`.
    *   **Public IP: TURN ON** (Rất quan trọng).
*   **Load Balancing:** None (Không chọn).
*   Create Service.

### 4. Lấy IP của Backend
*   Sau khi Service trạng thái **Active** và Task trạng thái **Running**:
*   Vào Tab **Tasks** -> Bấm vào Task ID -> Tìm mục **Networking** -> Copy **Public IP** (hoặc Private IP nếu EC2 Nginx nằm cùng VPC, nhưng khuyến khích dùng **Private IP** cho an toàn và nhanh hơn).
*   *Lưu ý:* Trong hướng dẫn này giả sử Nginx nằm cùng VPC -> **Chúng ta sẽ dùng Private IP** (Dạng 172.31.x.x).

---

## Phần 4: Setup Nginx Load Balancer (EC2)

Bây giờ dựng con "Cổng đi vào" (Reverse Proxy).

### 1. Tạo EC2 Instance
*   Vào EC2 -> Launch Instances.
*   Name: `aov-loadbalancer`.
*   OS: **Ubuntu** (hoặc Amazon Linux 2023).
*   Instance Type: **t3.micro** (Free tier).
*   Key pair: Tạo mới để SSH.
*   **Network settings:**
    *   Security Group: Chọn `sg-nginx-lb`.
    *   Auto-assign Public IP: Enable.
*   Launch Instance.

### 2. Cài đặt Nginx & Certbot
SSH vào EC2 vừa tạo:
```bash
ssh -i key.pem ubuntu@<EC2-PUBLIC-IP>
```

Chạy lệnh cài đặt:
```bash
sudo apt update
sudo apt install nginx certbot python3-certbot-nginx -y
```

### 3. Cấu hình Nginx Proxy
Tạo file config mới:
```bash
sudo nano /etc/nginx/sites-available/aov-app
```

Dán nội dung sau (Thay `BACKEND_PRIVATE_IP` bằng IP bạn copy ở Phần 3):

```nginx
server {
    server_name api.yourdomain.com; # Hoặc dùng Public DNS của EC2 nếu chưa mua domain

    location / {
        # Thay thế bằng Private IP của ECS Task Backend
        proxy_pass http://<BACKEND_PRIVATE_IP>:8000;
        
        proxy_set_header Host $host;
        proxy_set_header X-Real-IP $remote_addr;
        proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
        proxy_set_header X-Forwarded-Proto $scheme;
    }
}
```

Active config và restart Nginx:
```bash
sudo ln -s /etc/nginx/sites-available/aov-app /etc/nginx/sites-enabled/
sudo rm /etc/nginx/sites-enabled/default
sudo nginx -t
sudo systemctl restart nginx
```

### 4. Setup SSL (HTTPS) - *Optional nhưng nên làm*
Nếu bạn có domain thật:
```bash
sudo certbot --nginx -d api.yourdomain.com
```

### 5. Lấy DNS/IP Load Balancer
*   Địa chỉ API chính thức của bạn bây giờ là: `http://<EC2-PUBLIC-IP>` (hoặc domain nếu đã map).
*   **Lưu lại địa chỉ này** để điền vào `BACKEND_URL` cho Video Worker và Frontend.

---

## Phần 5: Host Video Worker

Video Worker chạy ngầm, không cần Load Balancer, nhưng cần biết địa chỉ Backend.

### 1. Tạo Task Definition (Worker)
*   Tạo mới Task Def `aov-worker-task`.
*   Container details:
    *   Image: `docker.io/yourusername/aov-video-worker:latest`.
    *   Port mappings: **Không điền**.
    *   **Environment Variables:**
        *   Copy giống Backend.
        *   **Quan trọng:** `BACKEND_URL` = `http://<EC2-PRIVATE-IP-CUA-NGINX>` (Hoặc Public IP của Nginx nếu thích, nhưng dùng Private IP giữa EC2 và ECS nhanh hơn).

### 2. Chạy Service Worker
*   Tạo Service `service-worker`.
*   Networking: Chọn Public Subnet, Security Group `sg-backend-worker`, Public IP: ON.
*   Load Balancing: None.

---

## Phần 6: Thiết lập CI/CD (GitHub Actions)

Update file `.github/workflows/deploy.yml` để tự động build và update ECS.

**Secrets cần có trên GitHub:**
*   `DOCKERHUB_USERNAME`, `DOCKERHUB_TOKEN`
*   `AWS_ACCESS_KEY_ID`, `AWS_SECRET_ACCESS_KEY`, `AWS_REGION`
*   `ECS_CLUSTER`: `aov-cluster`
*   `ECS_SERVICE_BACKEND`: `service-backend`
*   `ECS_SERVICE_WORKER`: `service-worker`

*Lưu ý:* Vì chúng ta cấu hình IP thủ công trong Nginx, CI/CD chỉ giúp update code mới (Force New Deployment). Nếu ECS Task bị chết hẳn và sinh ra Task mới với IP mới -> **Bạn phải SSH vào EC2 sửa lại IP trong nginx.conf và restart nginx**. (Chấp nhận điều này để tiết kiệm chi phí Load Balancer).

---

## Phần 7: Deploy Frontend (Vercel)

1.  Deploy lên Vercel.
2.  Set Environment Variable `VITE_API_URL` = `https://api.yourdomain.com` (Địa chỉ Nginx EC2).
3.  Enjoy!

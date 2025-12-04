worker_processes 1;

events { worker_connections 1024; }

http {
    server {
        listen 80;

        # Password protection
        auth_basic "Restricted Access";
        auth_basic_user_file /etc/nginx/.htpasswd;

        root /usr/share/nginx/html;
        index index.html;

        location / {
            try_files $uri /index.html;
        }

        # Reverse proxy prefix
        location /proxy/ {
            proxy_pass http://example.com/;  # Replace with actual target URL
            proxy_set_header Host $host;
            proxy_set_header X-Real-IP $remote_addr;
            proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
        }
    }
}

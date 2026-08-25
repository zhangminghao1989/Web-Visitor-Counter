# Web-Visitor-Counter
基于Cloudflare Workers和Cloudflare KV存储的网页访问量(PV)统计。

# 部署方式
1.创建一个KV储存

2.创建一个Worker，绑定上一步创建的KV，KV变量名称设置为VISITOR_COUNTER

3.将worker.js代码部署进Worker，注意设置域名白名单。

4.部署前端代码，参考footer.html

"""n8n 웹훅으로 보내기: multipart (payload = JSON 글, photo0.. = 사진 파일). 표준 라이브러리만."""
import json
import mimetypes
import os
import urllib.request
import uuid


def build_multipart(payload, photo_paths):
    boundary = "----kakaoreader" + uuid.uuid4().hex
    parts = []

    def add(headers, body):
        parts.append(("--%s\r\n%s\r\n\r\n" % (boundary, "\r\n".join(headers))).encode("utf-8") + body + b"\r\n")

    # Content-Type 을 붙이면 n8n 이 파일로 받는다 → 그냥 글 칸으로 보낸다
    add(['Content-Disposition: form-data; name="payload"'], json.dumps(payload, ensure_ascii=False).encode("utf-8"))
    for i, p in enumerate(photo_paths):
        ctype = mimetypes.guess_type(p)[0] or "application/octet-stream"
        with open(p, "rb") as f:
            data = f.read()
        name = os.path.basename(p)
        add(['Content-Disposition: form-data; name="photo%d"; filename="%s"' % (i, name), "Content-Type: " + ctype], data)
    body = b"".join(parts) + ("--%s--\r\n" % boundary).encode("utf-8")
    return body, "multipart/form-data; boundary=" + boundary


def send(url, owner_key, payload, photo_paths, timeout=60):
    body, ctype = build_multipart(payload, photo_paths)
    req = urllib.request.Request(url, data=body, method="POST", headers={"Content-Type": ctype})
    if owner_key:
        req.add_header("x-owner-key", owner_key)
    with urllib.request.urlopen(req, timeout=timeout) as r:
        return r.status, r.read().decode("utf-8", "replace")


def notify(url, owner_key, text, timeout=30):
    """n8n 카톡_알림 → 사장님 텔레그램. 실패해도 프로그램은 계속 (돌려주는 값 True/False)."""
    req = urllib.request.Request(url, data=json.dumps({"text": text}, ensure_ascii=False).encode("utf-8"), method="POST",
                                 headers={"Content-Type": "application/json", "x-owner-key": owner_key})
    try:
        with urllib.request.urlopen(req, timeout=timeout) as r:
            return r.status == 200
    except Exception:
        return False

"""텔레그램 글 꾸미기 (사장님 11/1): 첫 줄 굵게, 종류마다 이모지, 긴 견적서 주소는 '👉 견적서 열기' 한 줄.

Html 로 감싼 글만 n8n 카톡_알림 이 서식(HTML)으로 보낸다. 그냥 글(실패 알림 등)은 지금처럼 <>& 를 바꿔 그대로 보낸다.
Html 글 안에 들어가는 카톡 글·이름은 반드시 esc() 를 거친다.
"""
import html

EMOJI = {"견적 문의": "💬", "견적 추가": "➕", "하자보수": "🛠", "일정 변경": "📅", "결제": "💰"}


class Html(str):
    """텔레그램에 서식(HTML)으로 보낼 글."""


def esc(s):
    return html.escape(str(s if s is not None else ""), quote=False)


def b(s):
    return "<b>%s</b>" % esc(s)


def link(url, label="👉 견적서 열기"):
    return '<a href="%s">%s</a>' % (html.escape(str(url), quote=True), esc(label))


def emoji(kind):
    return EMOJI.get(kind, "📌")


def lines(*xs):
    """빈 줄은 빼고 한 글로 (각 줄은 이미 esc/b/link 를 거친 것)."""
    return Html("\n".join(x for x in xs if x))


def place(title):
    """'미래타운4단지 가견적 10월31일 오후6시(류춘화)' → '미래타운4단지'."""
    t = str(title or "").strip()
    return t.split(" 가견적")[0].strip() or t


def published(who, title, items, photos, url, warn=(), missing=(), unmatched=(), notes=()):
    """가견적 발행 알림 (텔레그램 버튼 발행·김정헌 방 견적발행시작 둘 다)."""
    return lines("📄 " + b("가견적 발행 · %s" % who),
                 esc("%s · 품목 %d개 · 사진 %d장" % (place(title), items, photos)),
                 *["⚠ " + esc(w) for w in warn],
                 "❓ 빠진 정보: " + esc(", ".join(missing)) if missing else "",
                 "❗ 못 넣은 품목: " + esc(", ".join(unmatched)) if unmatched else "",
                 *[esc(n) for n in notes],
                 link(url))

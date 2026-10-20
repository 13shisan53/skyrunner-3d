from PIL import Image, ImageDraw, ImageFont

W, H = 1200, 630
SRC = r"C:\Users\Gu mo\Documents\deepseek-harness\default-workspace\skyrunner-3d\docs\desktop-mid.png"
OUT = r"C:\Users\Gu mo\Documents\deepseek-harness\default-workspace\skyrunner-3d\article\images\cover.png"

canvas = Image.new("RGB", (W, H), (8, 14, 26))
d = ImageDraw.Draw(canvas)

# left panel gradient
for x in range(0, 760):
    t = x / 760
    c = (
        int(10 + 12 * t),
        int(16 + 18 * t),
        int(28 + 26 * t),
    )
    d.line([(x, 0), (x, H)], fill=c)

# right: screenshot
shot = Image.open(SRC).convert("RGB")
tw, th = 640, H
scale = max(tw / shot.width, th / shot.height)
shot = shot.resize((int(shot.width * scale + 0.5), int(shot.height * scale + 0.5)), Image.LANCZOS)
left = int((shot.width - tw) * 0.62)
top = int((shot.height - th) * 0.42)
shot = shot.crop((left, top, left + tw, top + th))

# blend the screenshot's left edge into the panel
mask = Image.new("L", (tw, th), 255)
md = ImageDraw.Draw(mask)
fade = 150
for i in range(fade):
    md.line([(i, 0), (i, th)], fill=int(255 * (i / fade) ** 0.8))
canvas.paste(shot, (W - tw, 0), mask)

img = canvas.convert("RGBA")
d = ImageDraw.Draw(img)

accent = (92, 225, 230)
white = (245, 249, 255)
dim = (150, 176, 206)

f_tag = ImageFont.truetype(r"C:\Windows\Fonts\msyh.ttc", 24)
f_big = ImageFont.truetype(r"C:\Windows\Fonts\msyhbd.ttc", 62)
f_mid = ImageFont.truetype(r"C:\Windows\Fonts\msyh.ttc", 30)
f_small = ImageFont.truetype(r"C:\Windows\Fonts\msyh.ttc", 21)

x = 64
d.text((x, 88), "S K Y R U N N E R", font=f_tag, fill=accent)

d.text((x, 140), "没有引擎", font=f_big, fill=white)
d.text((x, 214), "没有美术资源", font=f_big, fill=white)

d.rectangle([x, 306, x + 88, 310], fill=accent)

d.text((x, 336), "我写了个能玩的", font=f_mid, fill=(206, 224, 244))
d.text((x, 376), "3D 平台游戏", font=f_mid, fill=(206, 224, 244))

d.text((x, 444), "1200 行代码 · three.js · 手机也能玩", font=f_small, fill=dim)

# play pill
pill = [x, 496, x + 236, 548]
d.rounded_rectangle(pill, radius=26, fill=(47, 201, 201))
d.text((x + 26, 508), "在线试玩 →", font=ImageFont.truetype(r"C:\Windows\Fonts\msyhbd.ttc", 22), fill=(4, 26, 30))

img.convert("RGB").save(OUT, quality=95)
print("wrote", OUT, img.size)

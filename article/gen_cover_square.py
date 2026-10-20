from PIL import Image, ImageDraw, ImageFont

W = H = 1080
SRC = r"C:\Users\Gu mo\Documents\deepseek-harness\default-workspace\skyrunner-3d\docs\desktop-mid.png"
OUT = r"C:\Users\Gu mo\Documents\deepseek-harness\default-workspace\skyrunner-3d\article\images\cover-square.png"

card = Image.new("RGB", (W, H), (9, 15, 28))
d = ImageDraw.Draw(card)

# screenshot block on top
shot_h = 560
shot = Image.open(SRC).convert("RGB").crop((80, 120, 1200, 700))
scale = max(W / shot.width, shot_h / shot.height)
shot = shot.resize((int(shot.width * scale + 0.5), int(shot.height * scale + 0.5)), Image.LANCZOS)
left = int((shot.width - W) // 2)
top = int((shot.height - shot_h) * 0.34)
shot = shot.crop((left, top, left + W, top + shot_h))
card.paste(shot, (0, 0))

# fade the bottom of the screenshot into the card
fade_h = 160
mask = Image.new("L", (W, fade_h))
md = ImageDraw.Draw(mask)
for y in range(fade_h):
    md.line([(0, y), (W, y)], fill=int(255 * (1 - y / fade_h) ** 1.2))
dark = Image.new("RGB", (W, fade_h), (9, 15, 28))
card.paste(dark, (0, shot_h - fade_h), mask)

img = card.convert("RGBA")
d = ImageDraw.Draw(img)

accent = (92, 225, 230)
white = (245, 249, 255)
dim = (152, 178, 208)

f_tag = ImageFont.truetype(r"C:\Windows\Fonts\msyh.ttc", 26)
f_big = ImageFont.truetype(r"C:\Windows\Fonts\msyhbd.ttc", 64)
f_mid = ImageFont.truetype(r"C:\Windows\Fonts\msyh.ttc", 34)
f_small = ImageFont.truetype(r"C:\Windows\Fonts\msyh.ttc", 24)

x = 64
y = 596
d.text((x, y), "S K Y R U N N E R", font=f_tag, fill=accent)
d.text((x, y + 44), "没有引擎，没有美术资源", font=f_big, fill=white)
d.text((x, y + 128), "我写了个能玩的 3D 平台游戏", font=ImageFont.truetype(r"C:\Windows\Fonts\msyhbd.ttc", 46), fill=white)

d.rectangle([x, y + 208, x + 84, y + 212], fill=accent)

d.text((x, y + 240), "1200 行代码 · three.js · 手机也能玩", font=f_mid, fill=(206, 224, 244))
d.text((x, y + 296), "在线试玩  13shisan53.github.io/skyrunner-3d", font=f_small, fill=dim)

img.convert("RGB").save(OUT, quality=95)
print("wrote", OUT, img.size)

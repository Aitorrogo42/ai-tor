# Compare candidate fonts to the "MARS" lettering of the reference photo (letter shapes, binary IoU at best weight).
import sys, numpy as np
from PIL import Image, ImageDraw, ImageFont
D='/workspace/ai-tor-design/'
a=np.asarray(Image.open(D+'mars-photo-source.jpg').convert('RGB')).astype(int)
G=a[:,:,1]
boxes={'M':(223,250),'A':(266,292),'R':(309,330),'S':(345,367)}
T,B=34,71
ref={}
for ch,(x0,x1) in boxes.items():
    sub=G[T:B+1,x0-2:x1+3]; thr=(sub.max()+np.median(sub))/2
    m=sub>thr; ys,xs=np.nonzero(m); ref[ch]=m[ys.min():ys.max()+1,xs.min():xs.max()+1]
H=ref['M'].shape[0]
def glyph(path,ch,wght,var=True):
    f=ImageFont.truetype(path,400)
    if var:
        try:
            ax=f.get_variation_axes(); vals=[]
            for x in ax:
                n=x['name']; n=n.decode() if isinstance(n,bytes) else n
                vals.append(wght if 'eight' in n else x['default'])
            f.set_variation_by_axes(vals)
        except Exception as e: pass
    im=Image.new('L',(900,900),0); ImageDraw.Draw(im).text((100,100),ch,font=f,fill=255)
    m=np.asarray(im)>127; ys,xs=np.nonzero(m); m=m[ys.min():ys.max()+1,xs.min():xs.max()+1]
    h=H; w=max(1,round(m.shape[1]*H/m.shape[0]))
    r=np.asarray(Image.fromarray((m*255).astype('uint8')).resize((w,h),Image.LANCZOS))>127
    return r
def iou(r,g):
    h=max(r.shape[0],g.shape[0]); w=max(r.shape[1],g.shape[1])
    R=np.zeros((h,w),bool);Gm=np.zeros((h,w),bool)
    # centre horizontally
    R[:r.shape[0],(w-r.shape[1])//2:(w-r.shape[1])//2+r.shape[1]]=r
    Gm[:g.shape[0],(w-g.shape[1])//2:(w-g.shape[1])//2+g.shape[1]]=g
    from scipy import ndimage as ndi
    Rd=ndi.binary_dilation(R,iterations=2); Gd=ndi.binary_dilation(Gm,iterations=2)
    # symmetric tolerance score: fraction of each mask lying within 2px of the other
    return 0.5*((R&Gd).sum()/max(1,R.sum())+(Gm&Rd).sum()/max(1,Gm.sum()))
cands={'montserrat':'montserrat.ttf','jost':'jost.ttf','outfit':'outfit.ttf','urbanist':'urbanist.ttf','lexend':'lexend.ttf','josefin':'josefin.ttf','raleway':'raleway.ttf','manrope':'manrope.ttf','sora':'sora.ttf','redhat':'redhat.ttf','kumbh':'kumbh.ttf','spartan':'spartan.ttf'}
cands.update({'questrial':'questrial.ttf'})
import json
print('ref widths/H', {c:round(ref[c].shape[1]/H,2) for c in ref}, 'stroke px (M left stem)', ref['M'][H//2,:6].sum())
res=[]
for name,fn in cands.items():
    best=None
    for w in (100,150,200,250,300,400,500,600):
        try: sc=[iou(ref[c],glyph(D+'fonts-src/'+fn,c,w,name!='questrial')) for c in 'MARS']
        except Exception as e: print(name,e); break
        s=np.mean(sc)
        if best is None or s>best[0]: best=(s,w,sc)
    if best: res.append((best[0],name,best[1],[round(x,2) for x in best[2]]))
for r in sorted(res,reverse=True): print(round(r[0],3),r[1],r[2],r[3], 'widths', [round(glyph(D+'fonts-src/'+cands[r[1]],c,r[2],r[1]!='questrial').shape[1]/H,2) for c in 'MARS'])

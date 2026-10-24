-- Luma's original on-screen controls. mpv provides video output and input routing.
local mp = require 'mp'
local overlay = mp.create_osd_overlay('ass-events')
local W, H, scale, mx, my = 1280, 720, 1, -1, -1
local elements, menu, drag, pressed = {}, nil, nil, nil
local last_activity, opacity, last_tick = mp.get_time(), 1, mp.get_time()
local panel, menu_box, frame = {}, nil, {}
local page = 0
local last_visible
local last_menu, context_at = false, {x=0,y=0}
local menu_leave_at, layout_signature = nil, ''
local last_seek_height
local subtitle_offset, applied_subtitle_offset
local function clamp(n, a, b) return math.max(a, math.min(b, n)) end
local function prop(name, fallback) return mp.get_property_native(name, fallback) end
subtitle_offset=prop('sub-margin-y-offset',0)
applied_subtitle_offset=subtitle_offset
local function subtitle_safe_area(shown)
    local target=subtitle_offset
    if shown then
        local reserve=(H-panel.y+24)
        reserve=prop('sub-scale-with-window',true) and prop('sub-scale-by-window',true) and reserve*720/H or reserve*scale
        target=math.max(subtitle_offset,math.ceil(reserve)-prop('sub-margin-y',34))
    end
    if target~=applied_subtitle_offset then
        if pcall(mp.set_property_number,'sub-margin-y-offset',target) then applied_subtitle_offset=target end
    end
end

local function clock(n)
    n = math.max(0, math.floor(n or 0))
    if n >= 3600 then return string.format('%d:%02d:%02d', n / 3600, n / 60 % 60, n % 60) end
    return string.format('%d:%02d', n / 60, n % 60)
end
local function alpha(a) return string.format('%02X', clamp(math.floor(255 - (255 - (a or 0)) * opacity), 0, 255)) end
local function event(tags, content) frame[#frame + 1] = '{\\rDefault\\bord0\\shad0' .. tags .. '}' .. content end
local function path(x, y, shape, color, a, size, stroke)
    local style = string.format('\\an7\\pos(%.2f,%.2f)\\fscx(%.2f)\\fscy(%.2f)', x, y, (size or 1) * 100, (size or 1) * 100)
    if stroke then
        style = style .. '\\1a&HFF&\\3c&H' .. (color or 'FFFFFF') .. '&\\3a&H' .. alpha(a) .. '&\\bord1.2'
    else style = style .. '\\1c&H' .. (color or 'FFFFFF') .. '&\\1a&H' .. alpha(a) .. '&' end
    event(style .. '\\p1', shape .. '{\\p0}')
end
local function rect(x, y, w, h, r, color, a)
    if w <= 0 or h <= 0 then return end
    r = math.min(r or 0, w / 2, h / 2)
    local k = r * .5522848
    path(x, y, string.format('m %.2f 0 l %.2f 0 b %.2f 0 %.2f %.2f %.2f %.2f l %.2f %.2f b %.2f %.2f %.2f %.2f %.2f %.2f l %.2f %.2f b %.2f %.2f 0 %.2f 0 %.2f l 0 %.2f b 0 %.2f %.2f 0 %.2f 0',
        r,w-r,w-r+k,w,r-k,w,r,w,h-r,w,h-r+k,w-r+k,h,w-r,h,r,h,r-k,h,h-r+k,h-r,r,r-k,r-k,r), color, a)
end
-- Align gradient strips to output pixels so fractional DPI does not leave seams.
local function gradient(y,height,from_alpha,to_alpha,power)
    local top=math.floor(y*scale+.5)
    local pixels=math.max(1,math.floor(height*scale+.5))
    local step=math.max(1,math.ceil(pixels/256))
    for pixel=0,pixels-1,step do
        local progress=(pixel/math.max(1,pixels-1))^(power or 1)
        rect(0,(top+pixel)/scale,W,math.min(step,pixels-pixel)/scale,0,'000000',from_alpha+(to_alpha-from_alpha)*progress)
    end
end
local function text(x, y, value, size, a, align, bold, max_width)
    local clip = max_width and string.format('\\clip(%.0f,0,%.0f,%.0f)', x, x + max_width, H) or ''
    event(string.format('\\an%d\\pos(%.2f,%.2f)\\fnSegoe UI\\fs%d\\b%d\\1c&HFFFFFF&\\1a&H%s&%s', align or 4,x,y,size or 13,bold and 1 or 0,alpha(a),clip), mp.command_native({'escape-ass', tostring(value or '')}))
end
local function inside(box) return box and mx >= box.x and mx <= box.x + box.w and my >= box.y and my <= box.y + box.h end
local function button(id, x, y, w, h, callback, label)
    local item = {id=id,x=x,y=y,w=w,h=h,click=callback,label=label}
    elements[#elements + 1] = item
    if inside(item) then rect(x,y,w,h,9,'FFFFFF',225) end
    return item
end
local function icon(name, x, y, s, a)
    if name == 'pause' then
        path(x,y,'m 6 4 l 10 4 10 20 6 20 m 14 4 l 18 4 18 20 14 20','FFFFFF',a,s)
    elseif name == 'play' then path(x,y,'m 7 3 l 22 12 7 21','FFFFFF',a,s)
    elseif name == 'back' then path(x,y,'m 14 5 l 7 12 14 19 m 7 12 l 21 12','FFFFFF',a,s,true)
    elseif name == 'close' then path(x,y,'m 6 6 l 18 18 m 18 6 l 6 18','FFFFFF',a,s,true)
    elseif name == 'minimize' then path(x,y,'m 5 12 l 19 12','FFFFFF',a,s,true)
    elseif name == 'fullscreen' then path(x,y,'m 4 10 l 4 4 10 4 10 5.5 5.5 5.5 5.5 10 m 14 4 l 20 4 20 10 18.5 10 18.5 5.5 14 5.5 m 20 14 l 20 20 14 20 14 18.5 18.5 18.5 18.5 14 m 10 20 l 4 20 4 14 5.5 14 5.5 18.5 10 18.5','FFFFFF',a,s)
    elseif name == 'subtitles' then
        rect(x+2*s,y+4*s,20*s,16*s,3*s,'FFFFFF',a or 0)
        rect(x+3.4*s,y+5.4*s,17.2*s,13.2*s,2*s,'30302C',0)
        path(x,y,'m 6 10 l 11 10 m 14 10 l 18 10 m 6 14 l 9 14 m 12 14 l 18 14','FFFFFF',a,s,true)
    elseif name == 'audio' then
        path(x,y,'m 4 16 l 4 11 b 4 0 20 0 20 11 l 20 16 m 4 12 l 8 12 8 20 4 20 m 16 12 l 20 12 20 20 16 20','FFFFFF',a,s,true)
    elseif name == 'volume' then
        path(x,y,'m 3 9 l 7 9 12 5 12 19 7 15 3 15','FFFFFF',a,s)
        if prop('mute',false) then path(x,y,'m 16 9 l 22 15 m 22 9 l 16 15','FFFFFF',a,s,true)
        else path(x,y,'m 16 8 b 19 10 19 14 16 16 m 19 4 b 25 8 25 16 19 20','FFFFFF',a,s,true) end
    elseif name == 'rewind' or name == 'forward' then
        local shape = name == 'rewind' and 'm 5 7 b 11 0 23 5 22 14 b 21 23 7 25 3 16 m 5 2 l 5 8 11 8' or 'm 19 7 b 13 0 1 5 2 14 b 3 23 17 25 21 16 m 19 2 l 19 8 13 8'
        path(x,y,shape,'FFFFFF',a,s,true)
        text(x+12*s,y+14*s,'10',8*s,a,5,true)
    end
end
local function activity() last_activity = mp.get_time() end
local function toggle_menu(kind) menu = menu == kind and nil or kind; page = 0; menu_leave_at=nil; activity() end
local function back() if menu=='color-curve' or menu=='color-peak' then menu='color';page=0 elseif menu then menu=nil elseif prop('fullscreen') then mp.set_property_native('fullscreen',false) else mp.commandv('quit') end;activity() end
local function seek(n) mp.commandv('seek', clamp(n,0,prop('duration',0)), 'absolute+exact'); activity() end
local languages={eng='英语',en='英语',chi='中文',zho='中文',zh='中文',cmn='普通话',yue='粤语',jpn='日语',ja='日语',kor='韩语',ko='韩语',fra='法语',fre='法语',fr='法语',deu='德语',ger='德语',de='德语',spa='西班牙语',es='西班牙语',rus='俄语',ru='俄语'}
local function track_label(t)
    local lang=languages[t.lang or t.language or ''] or t.lang or t.language or ''
    local title=t.title or ''
    if title~='' and title~=lang then return lang~='' and lang..' · '..title or title end
    return lang~='' and lang or '轨道 '..(t.id or t.index or '')
end
local function info_lines()
    local media=prop('user-data/luma-osc/media',{})
    if menu=='overview' then
        return {media.description or '暂无影片简介，请先在影音库匹配资料。','', '导演  '..(media.director or '暂无资料'), '类型  '..table.concat(media.genre or {},' / '), '演职人员  '..table.concat(media.cast or {},' / ')}
    end
    local tech=media.technical or {}
    local rows={'分辨率  '..(tech.width and (tech.width..' × '..(tech.height or '')) or '尚未探测'), '视频编码  '..string.upper(tech.videoCodec or '未知'), '封装格式  '..(tech.container or '未知'), '动态范围  '..(tech.hdr and 'HDR 片源' or 'SDR / 未标注 HDR'),'', '音轨语言'}
    local input,target=prop('video-params',{}),prop('video-target-params',{})
    table.insert(rows,5,'输入色彩  '..(input.colormatrix=='dolbyvision' and '杜比视界 · 色彩重建' or tostring(input.primaries or '未知'))..' / '..tostring(input.gamma or '未知'))
    table.insert(rows,6,'映射输出  '..tostring(target.primaries or '未知')..' / '..tostring(target.gamma or '未知')..(target['max-luma'] and string.format(' · %.0f 尼特',target['max-luma']) or ''))
    table.insert(rows,7,'亮度曲线  '..tostring(prop('tone-mapping','auto'))..' · 屏幕实际模式由系统决定')
    local audio,subs={},{}
    for _,t in ipairs(prop('track-list',{})) do
        if t.type=='audio' then audio[#audio+1]=track_label(t)..'  '..string.upper(t.codec or '')
        elseif t.type=='sub' then subs[#subs+1]=track_label(t)..'  '..string.upper(t.codec or '') end
    end
    rows[#rows+1]=#audio>0 and table.concat(audio,' / ') or '没有检测到音轨'
    rows[#rows+1]='';rows[#rows+1]='字幕';rows[#rows+1]=#subs>0 and table.concat(subs,' / ') or '没有检测到内封字幕'
    rows[#rows+1]='';rows[#rows+1]='文件位置';rows[#rows+1]=media.path or '未关联本地片源'
    if media.fileSize then rows[#rows+1]=string.format('文件大小  %.2f GB',media.fileSize/1073741824) end
    return rows
end
local function wrap_lines(rows,width)
    local result={}
    for _,value in ipairs(rows) do
        local line,count='',0
        for character in tostring(value):gmatch('[%z\1-\127\194-\244][\128-\191]*') do
            local length=#character>1 and 2 or 1
            if character=='\n' or count+length>width then result[#result+1]=line;line,count='',0 end
            if character~='\n' then line=line..character;count=count+length end
        end
        result[#result+1]=line
    end
    return result
end
local color_peak=tonumber(prop('target-peak')) or 0
local function set_output(output)
    mp.set_property('target-colorspace-hint','auto')
    mp.set_property('target-colorspace-hint-mode','target')
    mp.set_property('target-trc',output=='sdr' and 'srgb' or output=='hdr' and 'pq' or 'auto')
    mp.set_property('target-prim',output=='sdr' and 'bt.709' or output=='hdr' and 'bt.2020' or 'auto')
    mp.set_property('target-peak',output=='hdr' and color_peak>0 and tostring(color_peak) or 'auto')
    menu=nil;activity();mp.osd_message('已更新本次播放的色彩映射',2)
end
local function menu_rows()
    local rows = {}
    if menu == 'speed' then
        for _, rate in ipairs({.5,.75,1,1.25,1.5,2}) do
            local value=rate
            rows[#rows+1]={label=rate==1 and '正常速度' or rate..'×',selected=prop('speed',1)==rate,click=function() mp.set_property_number('speed',value);menu=nil end}
        end
    elseif menu=='audio' then
        for _, t in ipairs(prop('track-list',{})) do
            if t.type=='audio' then local id=t.id;rows[#rows+1]={label=track_label(t),selected=t.selected,click=function() mp.set_property_number('aid',id);menu=nil end} end
        end
        if #rows==0 then rows[#rows+1]={label='没有可切换的音轨',heading=true} end
    elseif menu=='subtitles' then
        rows[#rows+1]={label='关闭字幕',selected=prop('sid')==false or prop('sid')=='no',click=function() mp.set_property('sid','no');menu=nil end}
        for _, t in ipairs(prop('track-list',{})) do
            if t.type=='sub' then local id=t.id;rows[#rows+1]={label=track_label(t),selected=t.selected,click=function() mp.set_property_number('sid',id);menu=nil end} end
        end
    elseif menu=='context' then
        rows[#rows+1]={label='影片简介',click=function()menu='overview';page=0 end}
        rows[#rows+1]={label='片源信息',click=function()menu='source';page=0 end}
        rows[#rows+1]={label='画面异常？使用兼容解码',click=function() mp.set_property('hwdec','no');menu=nil;mp.osd_message('已切换兼容解码',2) end}
        rows[#rows+1]={label='画面与 HDR',click=function()menu='color';page=0 end}
        if prop('user-data/luma-osc/next-title','')~='' then rows[#rows+1]={label='播放下一集',click=function()menu=nil;mp.commandv('script-message','luma-next-episode')end} end
    elseif menu=='color' then
        local trc=prop('target-trc','auto')
        rows[#rows+1]={label='自动适配屏幕',selected=trc=='auto',click=function()set_output('auto')end}
        rows[#rows+1]={label='HDR 转 SDR · 普通屏幕',selected=trc=='srgb',click=function()set_output('sdr')end}
        rows[#rows+1]={label='HDR 屏幕 · PQ 输出',selected=trc=='pq',click=function()set_output('hdr')end}
        rows[#rows+1]={label='亮度映射曲线  ›',click=function()menu='color-curve';page=0 end}
        rows[#rows+1]={label='HDR 屏幕峰值亮度  ›',click=function()menu='color-peak';page=0 end}
        rows[#rows+1]={label='按场景分析亮度',selected=prop('hdr-compute-peak','auto')~='no',click=function()mp.set_property('hdr-compute-peak',prop('hdr-compute-peak','auto')=='no' and 'auto' or 'no');menu=nil end}
    elseif menu=='color-curve' then
        for _,curve in ipairs({{'auto','自动 · 均衡'},{'spline','Spline · 平滑过渡'},{'bt.2390','BT.2390 · 柔和高光'},{'bt.2446a','BT.2446A · HDR / SDR'},{'st2094-40','ST2094-40 · 动态曲线'},{'st2094-10','ST2094-10 · 动态曲线'}}) do
            local value=curve[1];rows[#rows+1]={label=curve[2],selected=prop('tone-mapping')==value,click=function()mp.set_property('tone-mapping',value);menu=nil end}
        end
    elseif menu=='color-peak' then
        if prop('target-trc')~='pq' then rows[#rows+1]={label='先选择 HDR 屏幕输出',heading=true}
        else for _,nits in ipairs({0,400,600,1000,1500,2000,4000}) do
            local value=nits;rows[#rows+1]={label=value==0 and '自动读取屏幕' or (value..' 尼特'),selected=color_peak==value,click=function()color_peak=value;mp.set_property('target-peak',value==0 and 'auto' or tostring(value));menu=nil end}
        end end
    end
    return rows
end
local function render()
    local dims=prop('osd-dimensions');if not dims or dims.w==0 or dims.h==0 then return end
    scale=math.min(math.max(prop('display-hidpi-scale',1),dims.h/900),dims.h/360,dims.w/320)
    W,H=dims.w/scale,dims.h/scale
    local mouse=prop('mouse-pos',{});mx,my=(mouse.x or -1)/scale,(mouse.y or -1)/scale
    local margin=W<440 and 16 or W<650 and 24 or 32
    panel={x=math.max(margin,(W-1120)/2),y=H-114,w=math.min(1120,W-margin*2),h=90}
    local now=mp.get_time()
    if menu and menu~='overview' and menu~='source' then
        local trigger=nil
        for _,item in ipairs(elements) do if item.id==menu then trigger=item;break end end
        local bridge=trigger and menu_box and my>=menu_box.y+menu_box.h and my<=trigger.y and mx>=math.min(trigger.x,menu_box.x) and mx<=math.max(trigger.x+trigger.w,menu_box.x+menu_box.w)
        if inside(menu_box) or inside(trigger) or bridge then menu_leave_at=nil
        elseif not menu_leave_at then menu_leave_at=now
        elseif now-menu_leave_at>.18 then menu=nil;menu_leave_at=nil end
    else menu_leave_at=nil end
    local hover=mouse.hover and (inside(panel) or inside(menu_box) or my<90)
    local visible=prop('pause',false) or menu or drag or hover or now-last_activity<2.8
    local dt=math.min(.1,now-last_tick);last_tick=now
    opacity=clamp(opacity+(visible and dt*7 or -dt*5),0,1)
    if last_visible ~= (opacity>0) then last_visible=opacity>0;mp.set_property_native('user-data/luma-osc/visible',last_visible) end
    subtitle_safe_area(opacity>0)
    frame,elements,menu_box={},{},nil
    if last_menu~=menu then last_menu=menu;mp.set_property_native('user-data/luma-osc/menu',menu or false) end
    if opacity <= 0 then
        overlay:remove();mp.disable_key_bindings('luma-panel');mp.disable_key_bindings('luma-top');mp.disable_key_bindings('luma-menu');return
    end
    -- Fade the edges instead of putting an opaque panel over the picture.
    local shade=math.min(200,H*.6)
    gradient(H-shade,shade,255,90,1.5)
    gradient(0,100,145,255,1)
    button('back',margin,24,40,40,back,'返回上一层');icon('back',margin+10,34,.85)
    text(margin+52,44,prop('media-title','Luma'),17,0,4,true,math.max(60,W-margin*2-156))
    button('minimize',W-margin-84,24,40,40,function()mp.set_property_native('window-minimized',true)end,'最小化');icon('minimize',W-margin-74,34,.85,45)
    button('close',W-margin-40,24,40,40,function()mp.commandv('quit')end,'关闭播放器');icon('close',W-margin-30,34,.85,45)
    local x,y,w=panel.x,panel.y,panel.w
    local compact=W<600
    local narrow=W<440
    local center=narrow and x+22 or x+w/2
    local row=y+44
    if not narrow then
        button('volume',x,row,40,40,function()mp.commandv('cycle','mute')end,'静音');icon('volume',x+11,row+11,.75,20)
    end
    if W>=760 then
        local v=button('volume-slider',x+44,row+7,72,26,nil,'音量');v.slider='volume'
        rect(v.x,v.y+11,v.w,3,1.5,'FFFFFF',205);rect(v.x,v.y+11,v.w*clamp(prop('volume',100)/100,0,1),3,1.5,'FFFFFF',45)
    end
    if not compact then
        button('rewind',center-78,row,40,40,function()mp.commandv('seek',-10,'relative+exact')end,'后退 10 秒');icon('rewind',center-69,row+9,.92,20)
        button('forward',center+38,row,40,40,function()mp.commandv('seek',10,'relative+exact')end,'前进 10 秒');icon('forward',center+47,row+9,.92,20)
    end
    button('toggle',center-22,row-2,44,44,function()mp.commandv('cycle','pause');activity()end,'播放 / 暂停')
    rect(center-22,row-2,44,44,22,'FFFFFF',239);icon(prop('pause') and 'play' or 'pause',center-11,row+9,.92)
    button('speed',x+w-172,row,40,40,function()toggle_menu('speed')end,'播放速度');text(x+w-152,row+20,prop('speed',1)..'×',12,20,5,true)
    button('audio',x+w-128,row,40,40,function()toggle_menu('audio')end,'音轨语言');icon('audio',x+w-117,row+11,.75,20)
    button('subtitles',x+w-84,row,40,40,function()toggle_menu('subtitles')end,'字幕');icon('subtitles',x+w-73,row+11,.75,20)
    button('fullscreen',x+w-40,row,40,40,function()mp.commandv('cycle','fullscreen')end,'全屏');icon('fullscreen',x+w-29,row+11,.75,20)
    local timeline=button('seek',x,y,w,18,nil);timeline.slider='seek'
    local position,duration=prop('time-pos',0),prop('duration',0)
    local ratio=duration>0 and clamp(position/duration,0,1) or 0
    local th=(inside(timeline) or drag=='seek') and 5 or 3
    if last_seek_height~=th then last_seek_height=th;mp.set_property_native('user-data/luma-osc/seek-height',th) end
    rect(timeline.x,y+9-th/2,timeline.w,th,th/2,'FFFFFF',194);rect(timeline.x,y+9-th/2,timeline.w*ratio,th,th/2,'FFFFFF',15)
    if inside(timeline) or drag=='seek' then
        rect(timeline.x+timeline.w*ratio-4,y+5,8,8,4,'FFFFFF',0)
        local at=clamp((mx-timeline.x)/timeline.w,0,1)
        local tip=clamp(timeline.x+timeline.w*at,x+30,x+w-30)
        rect(tip-30,y-31,60,25,7,'19171B',15);text(tip,y-18,clock(duration*at),11,0,5)
    end
    text(x,y+27,clock(position),11,80)
    text(x+w,y+27,'−'..clock(duration-position),11,80,6)
    if prop('pause') then text(x+w/2,y+27,'已暂停',10,130,5) end
    if menu=='overview' or menu=='source' then
        local media=prop('user-data/luma-osc/media',{})
        local mw=math.min(640,W-40)
        local lines=wrap_lines(info_lines(),math.floor((mw-48)/7.2))
        local limit=math.max(3,math.floor((H-225)/24))
        page=clamp(page,0,math.max(0,math.ceil(#lines/limit)-1))
        local first,last=page*limit+1,math.min((page+1)*limit,#lines)
        local mh=118+(last-first+1)*24+(#lines>limit and 38 or 0)
        local bx,by=(W-mw)/2,math.max(20,(H-mh)/2)
        menu_box={x=bx,y=by,w=mw,h=mh}
        rect(bx-1,by-1,mw+2,mh+2,23,'FFFFFF',219);rect(bx,by,mw,mh,22,'27272D',10)
        text(bx+26,by+26,menu=='overview' and '影片简介' or '片源信息',10,125)
        text(bx+26,by+56,media.title or prop('media-title'),20,0,4,true,mw-84)
        button('info-close',bx+mw-48,by+16,30,30,function()menu=nil end,'关闭影片信息');icon('close',bx+mw-43,by+21,.8,90)
        for index=first,last do text(bx+26,by+98+(index-first)*24,lines[index],13,35,4,false,mw-52) end
        if #lines>limit then
            button('previous',bx+18,by+mh-37,64,28,function()page=math.max(0,page-1)end);text(bx+50,by+mh-23,'上一页',10,95,5)
            text(bx+mw/2,by+mh-23,(page+1)..' / '..math.ceil(#lines/limit),10,120,5)
            button('next',bx+mw-82,by+mh-37,64,28,function()page=math.min(math.ceil(#lines/limit)-1,page+1)end);text(bx+mw-50,by+mh-23,'下一页',10,95,5)
        end
    elseif menu then
        local rows=menu_rows()
        local limit=math.max(3,math.floor((H-235)/34)-2)
        page=clamp(page,0,math.max(0,math.ceil(#rows/limit)-1))
        local first,last=page*limit+1,math.min((page+1)*limit,#rows)
        local mw=menu=='context' and math.min(280,W-24) or math.min(240,W-24)
        local mh=(last-first+1)*34+48+(#rows>limit and 34 or 0)
        local trigger=nil
        for _,item in ipairs(elements) do if item.id==menu then trigger=item;break end end
        local bx=clamp((trigger and trigger.x+trigger.w/2 or x+w-80)-mw/2,12,W-mw-12)
        local by=(trigger and trigger.y or y)-mh-10
        if menu=='context' or menu=='color' or menu=='color-curve' or menu=='color-peak' then bx=clamp(context_at.x,12,W-mw-12);by=clamp(context_at.y,12,H-mh-12) end
        menu_box={x=bx,y=by,w=mw,h=mh}
        rect(bx-1,by-1,mw+2,mh+2,17,'FFFFFF',218);rect(bx,by,mw,mh,16,'29272A',8)
        local labels={speed='播放速度',audio='音轨语言',subtitles='字幕',context='影片选项',color='画面与 HDR · 本次播放',['color-curve']='亮度映射曲线',['color-peak']='HDR 屏幕峰值亮度'}
        text(bx+18,by+23,labels[menu] or '',11,120)
        for index=first,last do
            local row=rows[index];local ry=by+40+(index-first)*34
            if row.heading then text(bx+18,ry+16,row.label,10,150)
            else if row.selected then rect(bx+8,ry,mw-16,32,8,'FFFFFF',239) end;button('row-'..index,bx+8,ry,mw-16,32,row.click);text(bx+18,ry+16,row.label,12,15,4,false,mw-55);if row.selected then text(bx+mw-24,ry+16,'✓',15,0,5) end end
        end
        if #rows>limit then
            local py=by+mh-35
            button('previous',bx+8,py,58,28,function()page=math.max(0,page-1)end);text(bx+37,py+14,'上一页',10,80,5)
            text(bx+mw/2,py+14,(page+1)..' / '..math.ceil(#rows/limit),10,100,5)
            button('next',bx+mw-66,py,58,28,function()page=math.min(math.ceil(#rows/limit)-1,page+1)end);text(bx+mw-37,py+14,'下一页',10,80,5)
        end
    end
    for _,item in ipairs(elements) do
        if item.label and inside(item) and not menu and not item.slider then
            local tx=clamp(item.x+item.w/2,60,W-60)
            rect(tx-64,item.y-37,128,28,7,'19171B',10);text(tx,item.y-23,item.label,11,0,5)
        end
    end
    local signature=W..'x'..H..':'..scale..':'..tostring(menu)..':'..page
    if signature~=layout_signature then
        layout_signature=signature
        local buttons={}
        for _,item in ipairs(elements) do buttons[item.id]={x=item.x,y=item.y,w=item.w,h=item.h} end
        mp.set_property_native('user-data/luma-osc/layout',{kind=menu or false,panel=panel,menu=menu_box,buttons=buttons,scale=scale,width=W,height=H})
    end
    overlay.res_x,overlay.res_y,overlay.z,overlay.data=W,H,1000,table.concat(frame,'\n');overlay:update()
    mp.set_mouse_area(x*scale,y*scale,(x+w)*scale,(y+90)*scale,'luma-panel');mp.enable_key_bindings('luma-panel')
    mp.set_mouse_area(0,0,W*scale,86*scale,'luma-top');mp.enable_key_bindings('luma-top')
    if menu_box then mp.set_mouse_area(menu_box.x*scale,menu_box.y*scale,(menu_box.x+menu_box.w)*scale,(menu_box.y+menu_box.h)*scale,'luma-menu');mp.enable_key_bindings('luma-menu') else mp.disable_key_bindings('luma-menu') end
end
local function slider(item)
    local value=clamp((mx-item.x)/item.w,0,1)
    if item.slider=='seek' then seek(value*prop('duration',0))
    else mp.set_property_number('volume',value*100);mp.set_property_native('mute',false) end
end
local function down()
    activity();pressed=nil
    for i=#elements,1,-1 do local item=elements[i];if inside(item) then pressed=item;if item.slider then drag=item.slider;slider(item) end;return end end
    if my<86 then mp.commandv('begin-vo-dragging') end
end
local function up()
    if pressed and not drag and inside(pressed) and pressed.click then pressed.click() end
    drag,pressed=nil,nil;activity();render()
end
for _,section in ipairs({'luma-panel','luma-top','luma-menu'}) do
    mp.set_key_bindings({{'MBTN_LEFT',function()down();up()end,down,up},{'MBTN_LEFT_DBL',function()end}},section,'force')
end
mp.add_forced_key_binding('MOUSE_MOVE','luma-move',function()
    activity();local m=prop('mouse-pos',{});mx,my=(m.x or -1)/scale,(m.y or -1)/scale
    if drag and pressed then slider(pressed) end
end)
mp.add_forced_key_binding('MOUSE_LEAVE','luma-leave',function()mx,my=-1,-1;if menu~='overview' and menu~='source' then menu=nil end end)
mp.add_forced_key_binding('MBTN_RIGHT','luma-context',function()
    local mouse=prop('mouse-pos',{});context_at={x=(mouse.x or 0)/scale,y=(mouse.y or 0)/scale};page=0;menu_leave_at=nil;menu=menu=='context' and nil or 'context';activity();render()
end)
mp.add_key_binding('SPACE','luma-pause',function()mp.commandv('cycle','pause');activity()end)
mp.add_key_binding('LEFT','luma-back',function()mp.commandv('seek',-10,'relative+exact');activity()end,{repeatable=true})
mp.add_key_binding('RIGHT','luma-forward',function()mp.commandv('seek',10,'relative+exact');activity()end,{repeatable=true})
mp.add_key_binding('N','luma-next-episode',function()if prop('user-data/luma-osc/next-title','')~='' then mp.commandv('script-message','luma-next-episode') end end)
mp.add_forced_key_binding('ESC','luma-escape',back)
mp.add_key_binding('Alt+LEFT','luma-go-back',back)
mp.add_key_binding('MBTN_LEFT','luma-background-click',function()if menu then menu=nil else mp.commandv('cycle','pause') end;activity()end)
mp.register_script_message('luma-show',function()activity();render()end)
mp.register_event('file-loaded',activity)
mp.register_event('shutdown',function()pcall(mp.set_property_number,'sub-margin-y-offset',subtitle_offset)end)
mp.observe_property('pause','bool',function()activity()end)
mp.set_property_native('user-data/luma-osc/loaded',true)
mp.add_periodic_timer(1/30,render)

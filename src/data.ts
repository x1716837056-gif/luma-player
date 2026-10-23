import type { Library, Media } from './types';

const art = (name: string) => `./artwork/${name}.jpg`;
const sample = (id: string, data: Partial<Media>): Media => ({
  id, title: '', originalTitle: '', year: 2024, kind: 'movie', genre: ['剧情'],
  duration: 120, rating: '8.0', certification: 'PG-13', poster: art(id),
  backdrop: art(`${id}-bg`), description: '', sourceId: 'nas', quality: '4K',
  addedAt: Date.parse('2026-10-20') - Number(id.replace(/\D/g, '') || 1) * 3600000,
  ...data,
});

export const demoLibrary: Library = {
  demo: true,
  sources: [
    { id: 'nas', name: '客厅 NAS', path: '\\\\Synology\\Movies', type: 'nas', status: 'online' },
    { id: 'local', name: '本地影片', path: 'D:\\Movies', type: 'local', status: 'online' },
  ],
  media: [
    sample('dune2', { title: '沙丘2', originalTitle: 'Dune: Part Two', year: 2024, genre: ['科幻', '冒险'], duration: 166, rating: '8.5', director: '丹尼斯·维伦纽瓦', cast: ['提莫西·查拉梅', '赞达亚', '丽贝卡·弗格森', '哈维尔·巴登'], description: '命运的沙海，再度启程。保罗·厄崔迪与契妮以及弗雷曼人并肩作战，向毁灭他家族的阴谋者展开复仇。在挚爱与宇宙的命运之间，他必须做出抉择。', quality: '4K HDR', progress: 0.38, favorite: true }),
    sample('interstellar', { title: '星际穿越', originalTitle: 'Interstellar', year: 2014, genre: ['科幻', '冒险', '剧情'], duration: 169, rating: '9.4', director: '克里斯托弗·诺兰', cast: ['马修·麦康纳', '安妮·海瑟薇', '杰西卡·查斯坦'], description: '在地球即将走向终点时，一支探险队穿越虫洞，寻找人类未来的家园。一段跨越星系与时间的旅程，也是一位父亲给女儿的承诺。', quality: '4K HDR', progress: 0.57, favorite: true }),
    sample('severance', { title: '人生切割术', originalTitle: 'Severance', year: 2022, kind: 'tv', genre: ['悬疑', '科幻'], duration: 55, rating: '9.1', episode: '第 1 季 · 第 4 集', description: '一家公司的员工接受手术，将工作和私人生活的记忆彻底分开。一个意外访客的出现，让这看似完美的平衡开始崩塌。', progress: 0.28, quality: '4K HDR' }),
    sample('lalaland', { title: '爱乐之城', originalTitle: 'La La Land', year: 2016, genre: ['爱情', '音乐'], duration: 128, rating: '8.4', director: '达米恩·查泽雷', cast: ['瑞恩·高斯林', '艾玛·斯通'], description: '在洛杉矶的星光下，一位怀揣梦想的演员和一位爵士钢琴家相遇。他们在音乐中相爱，在现实与梦想之间寻找属于自己的答案。', sourceId: 'local', progress: 0.19, quality: '1080P' }),
    sample('bladerunner', { title: '银翼杀手2049', originalTitle: 'Blade Runner 2049', year: 2017, genre: ['科幻', '悬疑'], duration: 164, rating: '8.3', director: '丹尼斯·维伦纽瓦', cast: ['瑞恩·高斯林', '哈里森·福特', '安娜·德·阿玛斯'], description: '2049 年，新一代银翼杀手 K 发现了一个足以颠覆社会的秘密。他开始追寻三十年前消失的前任银翼杀手瑞克·戴克。', quality: '4K HDR', favorite: true }),
    sample('oppenheimer', { title: '奥本海默', originalTitle: 'Oppenheimer', year: 2023, genre: ['剧情', '历史'], duration: 180, rating: '8.8', director: '克里斯托弗·诺兰', cast: ['基里安·墨菲', '艾米莉·布朗特', '小罗伯特·唐尼'], description: '理论物理学家罗伯特·奥本海默带领科学家团队开启改变世界的曼哈顿计划。当第一束光点亮荒漠，他也必须面对科学与良知的漫长回响。', quality: '4K HDR', sourceId: 'local' }),
    sample('arrival', { title: '降临', originalTitle: 'Arrival', year: 2016, genre: ['科幻', '剧情'], duration: 116, rating: '7.8', director: '丹尼斯·维伦纽瓦', cast: ['艾米·亚当斯', '杰瑞米·雷纳'], description: '十二艘神秘飞船降临地球。语言学家路易丝尝试理解来访者的语言，却在交流中发现，时间与生命或许有着截然不同的模样。', quality: '4K', watched: true }),
    sample('inception', { title: '盗梦空间', originalTitle: 'Inception', year: 2010, genre: ['科幻', '悬疑'], duration: 148, rating: '9.4', director: '克里斯托弗·诺兰', cast: ['莱昂纳多·迪卡普里奥', '约瑟夫·高登-莱维特', '汤姆·哈迪'], description: '一群进入他人梦境的盗梦者，接到一项几乎不可能的任务：将一个想法植入潜意识。梦境层层展开，现实的边界也逐渐模糊。', quality: '4K HDR', watched: true, favorite: true }),
    sample('pastlives', { title: '过往人生', originalTitle: 'Past Lives', year: 2023, genre: ['爱情', '剧情'], duration: 106, rating: '7.7', director: '席琳·宋', description: '儿时好友娜英与海圣因移民而分离，二十四年后在纽约重逢。一段短暂的相聚，让两人重新思考缘分、选择和未曾发生的人生。', quality: '1080P', sourceId: 'local' }),
    sample('batman', { title: '新蝙蝠侠', originalTitle: 'The Batman', year: 2022, genre: ['犯罪', '悬疑'], duration: 176, rating: '7.2', director: '马特·里夫斯', description: '布鲁斯·韦恩在哥谭的黑夜中追寻正义。谜语人的连环犯罪，将他带入城市深处盘根错节的秘密，也迫使他重新理解英雄的意义。', quality: '4K HDR' }),
    sample('dune', { title: '沙丘', originalTitle: 'Dune', year: 2021, genre: ['科幻', '冒险'], duration: 155, rating: '7.7', director: '丹尼斯·维伦纽瓦', description: '天赋异禀的少年保罗，为保卫家族与人民，前往宇宙中最危险的星球。在辽阔沙漠与巨大沙虫之间，一个传奇即将开启。', quality: '4K HDR', watched: true }),
    sample('bear', { title: '熊家餐馆', originalTitle: 'The Bear', year: 2022, kind: 'tv', genre: ['剧情', '喜剧'], duration: 30, rating: '8.6', episode: '第 1 季', description: '年轻主厨回到芝加哥，接手家族留下的三明治餐馆。在拥挤的厨房、家人的回忆与崭新梦想之间，他们寻找重新开始的可能。', quality: '4K', sourceId: 'local' }),
  ],
};

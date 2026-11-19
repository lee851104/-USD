// 四種組合的說明，整理自 LEI〈決定未來風險資產走向的，其實就這「兩個數字」〉影片中的表格。
// key 規則：`${美元方向}-${利差方向}`，up = 走強/走陡，down = 走弱/走平。

export const REGIMES = {
  'up-down': {
    id: 'up-down',
    num: 1,
    name: '流動性最緊縮',
    dollar: '美元走強',
    curve: '曲線走平',
    typical: '2Y 上升比 10Y 快（熊平）',
    driver: '緊縮預期升溫（如通膨反彈、聯準會轉鷹），資金成本直接被抬高。',
    assets: '殺估值：高估值科技股、加密貨幣、黃金與新興市場同步承壓；短債與美元現金最抗跌。',
    tone: 'risk-off',
    plain: '資金變貴、美元回流美國，對風險資產最不利。',
    good: ['短債', '美元現金'],
    bad: ['科技成長股', '加密貨幣', '黃金', '新興市場'],
  },
  'up-up': {
    id: 'up-up',
    num: 2,
    name: '結構性分化',
    dollar: '美元走強',
    curve: '曲線走陡',
    typical: '10Y 上升比 2Y 快（熊陡）',
    driver: '美國經濟過熱或財政發債壓力大，長端期限溢價上升，同時吸引全球資本流入美國。',
    assets: '強美元壓抑大宗商品與跨國企業海外營收，但美國本土價值股、金融股相對抗跌；長久期資產（如 TLT）受創。',
    tone: 'mixed',
    plain: '美國經濟偏熱、長天期利率上升，市場內部分化。',
    good: ['美國價值股', '金融股'],
    bad: ['大宗商品', '跨國企業', '長天期美債'],
  },
  'down-up': {
    id: 'down-up',
    num: 3,
    name: '流動性釋放初期',
    dollar: '美元走弱',
    curve: '曲線走陡',
    typical: '2Y 下跌比 10Y 快（牛陡）',
    driver: '聯準會轉向寬鬆或啟動降息週期，短端資金成本快速下降。',
    assets: '風險偏好回升：對利率最敏感的資產率先反彈（加密貨幣、黃金、高 Beta 成長股、新興市場）；美元與短債收益率下滑。',
    tone: 'risk-on',
    plain: '聯準會轉向寬鬆、資金變便宜，風險資產最先受惠。',
    good: ['加密貨幣', '黃金', '成長股', '新興市場'],
    bad: ['美元', '短債收益'],
  },
  'down-down': {
    id: 'down-down',
    num: 4,
    name: '避險主導',
    dollar: '美元走弱',
    curve: '曲線走平',
    typical: '10Y 下跌比 2Y 快（牛平）',
    driver: '經濟衰退預期主導，長端定價未來通膨與成長放緩，但聯準會尚未大幅降息。',
    assets: '看重防禦與確定性：長天期美債（TLT）表現最佳；高槓桿風險資產因獲利下修而波動加劇，需防範信用利差擴大。',
    tone: 'defensive',
    plain: '市場擔心經濟衰退，資金躲進長天期美債避險。',
    good: ['長天期美債'],
    bad: ['高槓桿風險資產'],
  },
};

// 矩陣排列：上排 = 曲線走陡，下排 = 曲線走平；左欄 = 美元走弱，右欄 = 美元走強
export const MATRIX_ORDER = ['down-up', 'up-up', 'down-down', 'up-down'];

export const LOOKBACKS = [20, 60, 120];
export const DEFAULT_LOOKBACK = 20;

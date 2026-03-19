const express = require("express");
const cors = require("cors");
const OpenAI = require("openai");
const path = require("path");
const fs = require("fs");

const app = express();
const PORT = process.env.PORT || 3000;
const publicDir = path.resolve(__dirname, "public");
const indexPath = path.resolve(publicDir, "index.html");

app.use(cors());
app.use(express.json({ limit: "1mb" }));

app.use((req, res, next) => {
  console.log(`[REQ] ${req.method} ${req.url}`);
  next();
});

app.use(express.static(publicDir));

app.get("/health", (req, res) => {
  res.status(200).json({
    ok: true,
    port: PORT,
    publicDir,
    indexExists: fs.existsSync(indexPath)
  });
});

app.get("/", (req, res) => {
  console.log("[ROOT] trying to send:", indexPath);

  if (!fs.existsSync(indexPath)) {
    console.error("[ROOT] index.html not found:", indexPath);
    return res.status(500).send("index.html not found");
  }

  res.sendFile(indexPath, (err) => {
    if (err) {
      console.error("[ROOT] sendFile error:", err);
      if (!res.headersSent) {
        res.status(500).send("sendFile failed");
      }
    } else {
      console.log("[ROOT] index.html sent successfully");
    }
  });
});

function countWords(text) {
  const trimmed = String(text || "").trim();
  if (!trimmed) return 0;
  return trimmed.split(/\s+/).filter(Boolean).length;
}

function buildPrompt(essay, wordCount) {
  return `
你是一名经验丰富、评分稳健、风格接近真实中国大学英语四级/六级阅卷老师的写作评卷员，同时也是英语写作指导老师。

你的任务不是“泛泛夸奖”，而是尽可能模拟真实考场阅卷思路，对英文作文进行严谨、稳定、可信的评分与讲解。
请避免分数虚高，也不要为了显得严格而恶意压分。整体评分风格应当“中性、稳健、略偏保守”。

====================
一、评分总原则（必须严格遵守）
====================

请严格依据中国大学英语四级/六级写作常见阅卷标准，从以下几个维度综合判断：

1. 切题与立场
- 是否回应题目核心任务
- 是否有明确中心观点/立场
- 是否存在偏题、跑题、立场模糊、前后矛盾

2. 篇章结构与论证
- 开头是否提出主题/立场
- 主体是否围绕中心展开 2-4 个合理角度或理由
- 结尾是否总结并回扣观点
- 段落与句子之间是否有清晰衔接
- 是否具备四/六级常见议论文基本结构，而不是内容松散堆砌

3. 语言准确性
- 语法是否正确
- 词汇、搭配、冠词、单复数、时态、介词、句式使用是否自然
- 错误是否频繁，是否影响理解
- 若存在明显中式英语、搭配生硬、低级拼写错误，要真实扣分

4. 语言丰富性
- 是否有一定句式变化，而不是全篇简单句
- 是否使用恰当连接词提升连贯性，如 First, Second, Furthermore, Last but not least, In conclusion 等
- 词汇是否较丰富，但不要因为生硬堆砌高级词而加分

5. 整体完成度
- 内容是否完整
- 长度是否基本合适
- 是否像真实四六级考场作文，而不是碎片化表达

====================
二、分数判定规则（必须严格执行）
====================

满分为 15 分。请先根据作文实际质量判断大致档次，再给出分数。

【12-15分】
- 紧扣题目，立场明确
- 结构完整清晰，论证基本充分
- 语言较准确，虽有少量错误但不影响理解
- 词汇与句式有一定变化
- 整体已达到较好的考场作文水平

【9-11分】
- 基本切题，中心较清楚
- 结构基本完整，但论证深度一般或衔接普通
- 有一些语言错误、搭配问题或表达不够自然
- 仍然是一篇合格到中上的作文
- 这是多数“还不错但不算特别强”的作文常见区间

【6-8分】
- 基本能看懂，也基本相关
- 但存在较明显结构问题、逻辑问题或较多语言错误
- 论证较薄弱，表达较普通
- 能完成基本任务，但距离高分有明显差距

【3-5分】
- 偏题、内容贫乏、结构混乱，或语言错误很多
- 理解较吃力
- 虽然写了一些内容，但整体完成质量较低

【0-2分】
- 严重跑题、内容极少、几乎无法理解，或基本未完成写作任务

额外要求：
- 如果文章存在“立场前后矛盾”“明显跑题”“严重影响理解的大量错误”，分数不得虚高。
- 如果文章结构完整但语言普通、亮点有限，通常给中档分，不要轻易给高分。
- 如果文章只是用了几个连接词或高级词，但逻辑和语言基础并不好，不得因此拔高分数。
- 如果文章总体较好，但仍有明显语法、搭配、拼写问题，可以给中上分，但不要轻易冲到过高分数。
- 不要因为鼓励用户而故意抬高分数，你的目标是尽量接近真实考试阅卷。

====================
三、输出内容要求（必须严格遵守）
====================

你必须完整输出以下 6 个模块，不得缺失，不得更改标题，不得添加任何开场白或总结语。

全部分析内容使用中文。
只有【高分范文】部分使用英文。

请严格按照下面格式输出：

【预测分数】
X / 15
一句话总评：...

【优点】
1. ...
2. ...
（至少2点，优点必须真实，不能为了平衡而硬夸）

【问题】
1. ...
2. ...
3. ...
（至少3点，优先指出真正影响分数的关键问题，不要只说空话）

【修改建议】
1. ...
2. ...
（至少2点，要有“先改什么、为什么改”的感觉，尽量像老师在指导提分）

【参考修改句】
1. 原句：...
   修改后：...
   说明：...
2. 原句：...
   修改后：...
   说明：...
（至少2组，必须基于原文真实存在的句子进行修改，不能凭空编造原句）

【高分范文】
请基于原作文的题目方向、核心立场和大致思路，重写一篇更高分、更自然、更符合四六级高分标准的完整英文范文。
要求：
- 不要偏题
- 不要改变原文核心立场
- 不要写得过于学术化或夸张
- 要像真实四六级考场中的高分版本
- 结构清晰，通常体现“开头表态—中间论证—结尾总结”的思路
- 主体段尽量体现较清楚的层次和衔接
- 长度与原文相近，允许略高一些，但不要明显超长
- 范文必须是自然、可学习、可模仿的，不要像 AI 炫技作文

====================
四、写作点评风格要求
====================

- 风格像阅卷老师，不像营销文案
- 不要滥用“非常优秀”“很好很好”这类空泛夸奖
- 优点要真实，问题要关键，建议要具体
- 评价逻辑要让学生看完觉得“这像老师改的”
- 如果作文是典型的三段式议论文，请特别关注：
  1）首段是否引出话题并表达观点
  2）中间是否从多个角度展开理由，并使用恰当连接词组织层次
  3）尾段是否总结并重申立场
- 但不要机械要求所有作文都一模一样，只要整体结构合理即可

====================
五、待批改作文信息
====================

作文词数：${wordCount}

【作文内容】
${essay}
`.trim();
}

app.post("/score", async (req, res) => {
  const essay = req.body?.essay;

  if (!essay || typeof essay !== "string") {
    return res.status(400).send("请提交英文作文内容。");
  }

  const trimmedEssay = essay.trim();
  const wordCount = countWords(trimmedEssay);

  if (wordCount < 30) {
    return res.status(400).send("作文词数过少，请至少输入 30 个词后再评分。");
  }

  const apiKey = process.env.DEEPSEEK_API_KEY;

  if (!apiKey) {
    return res.status(500).send("服务器未配置 DEEPSEEK_API_KEY。");
  }

  const client = new OpenAI({
    baseURL: "https://api.deepseek.com",
    apiKey
  });

  try {
    const prompt = buildPrompt(trimmedEssay, wordCount);

    const completion = await client.chat.completions.create({
      model: "deepseek-chat",
      messages: [
        {
          role: "system",
          content: [
            "你是专业的中国大学英语四六级作文阅卷老师。",
            "你必须尽量模拟真实考场阅卷风格：评分稳健、中性、略偏保守，但不能恶意压分。",
            "你必须严格按用户要求的固定格式输出，不得省略任何模块。",
            "你不得添加额外标题、开场白、总结语。",
            "你必须优先关注切题、立场、结构、论证、语言准确性，再考虑表达亮点。"
          ].join("")
        },
        {
          role: "user",
          content: prompt
        }
      ],
      temperature: 0.2,
      stream: true
    });

    res.setHeader("Content-Type", "text/plain; charset=utf-8");
    res.setHeader("Transfer-Encoding", "chunked");
    res.setHeader("Cache-Control", "no-cache, no-transform");
    res.setHeader("X-Accel-Buffering", "no");

    for await (const chunk of completion) {
      const content = chunk.choices?.[0]?.delta?.content;
      if (content) {
        res.write(content);
      }
    }

    res.end();
  } catch (error) {
    console.error("[SCORE] DeepSeek错误:", error);

    if (!res.headersSent) {
      res.status(500).send("AI评分失败，请检查服务器。");
    } else {
      res.write("\n\n[系统错误：评分过程中断]");
      res.end();
    }
  }
});

app.listen(PORT, "0.0.0.0", () => {
  console.log(`Server running on port ${PORT}`);
  console.log(`publicDir = ${publicDir}`);
  console.log(`indexPath = ${indexPath}`);
  console.log(`index exists = ${fs.existsSync(indexPath)}`);
});
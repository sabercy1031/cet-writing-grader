const express = require("express");
const cors = require("cors");
const OpenAI = require("openai");
const path = require("path");

const app = express();
const port = 3000;

// 中间件
app.use(cors());
app.use(express.json());

// 让服务器可以访问 public 文件夹里的网页
app.use(express.static(path.join(__dirname, "public")));

// DeepSeek API
const client = new OpenAI({
  baseURL: "https://api.deepseek.com",
  apiKey: "sk-c57dd6fb878747938c3444e7d275997a"
});

// 作文评分接口
app.post("/score", async (req, res) => {
  const essay = req.body.essay;

  if (!essay || essay.trim().length < 20) {
    return res.send("作文内容过短，请输入更完整的英文作文。");
  }

  try {
    const prompt = `
你是一名中国大学英语四级/六级考试的专业阅卷老师。

请严格按照四六级写作评分标准，对下面这篇英文作文进行评分和分析。

请按下面格式输出，使用中文回答：

预测分数：X / 15

优点：
1. ...
2. ...

问题：
1. ...
2. ...
3. ...

修改建议：
1. ...
2. ...

参考修改句：
1. ...
2. ...

作文内容：
${essay}
`;

    const completion = await client.chat.completions.create({
      model: "deepseek-chat",
      messages: [
        {
          role: "system",
          content: "你是专业的中国大学英语四六级作文阅卷老师，擅长评分、纠错和给出修改建议。"
        },
        {
          role: "user",
          content: prompt
        }
      ],
      temperature: 0.3,
      stream: true
    });

    res.setHeader("Content-Type", "text/plain; charset=utf-8");
    res.setHeader("Transfer-Encoding", "chunked");

    for await (const chunk of completion) {
      const content = chunk.choices?.[0]?.delta?.content;
      if (content) {
        res.write(content);
      }
    }

    res.end();
  } catch (error) {
    console.error("DeepSeek错误:", error);

    if (!res.headersSent) {
      res.status(500).send("AI评分失败，请检查服务器。");
    } else {
      res.write("\n\n[系统错误：评分过程中断]");
      res.end();
    }
  }
});

// 启动服务器
app.listen(port, () => {
  console.log("Server running on http://localhost:" + port);
});
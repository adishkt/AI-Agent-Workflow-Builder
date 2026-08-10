const express = require('express');
const cors = require("cors");

const app=express();

app.use(cors());
app.use(express.json());

app.get("/",(req,res) => {
    res.json({
        message: "AI Workflow Backend is running",
    });
});

const PORT = 5000;

app.listen(PORT, () => {
    console.log(`Backend running on http://localhost:${PORT}`);
});
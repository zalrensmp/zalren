import re

with open('server.js', 'r', encoding='utf-8') as f:
    content = f.read()

# Replace requires
content = re.sub(
    r"const { jsonCollection } = require\('\./db-store'\);",
    "const { connectDB, User, Staff, Forum, Leaderboard, Rules, Votes, Settings } = require('./db');\n\nconnectDB();",
    content
)

# Remove pure JS DB emulation and data dirs
content = re.sub(
    r"// Pure JS JSON-file based Database Emulator.*?const upload = multer\({ storage }\);",
    "const upload = multer({ dest: '/tmp' }); // Use /tmp for serverless file uploads",
    content,
    flags=re.DOTALL
)

# Remove the fake `db` object completely
content = re.sub(
    r"const db = {.*?};",
    "",
    content,
    flags=re.DOTALL
)

# The above just removes the mock DB. We need to replace all API handlers.
# It is actually way easier to just output the whole file from Python. Let's write the whole file content.

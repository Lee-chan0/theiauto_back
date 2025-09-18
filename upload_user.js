// migrate_past_users.js
import dotenv from "dotenv";
import mysql from "mysql2/promise";
import { PrismaClient } from "@prisma/client";
import iconv from "iconv-lite";

dotenv.config();

const prisma = new PrismaClient();

// 과거 DB 연결 (EUC-KR)
const src = await mysql.createPool({
  host: process.env.SRC_DB_HOST,
  user: process.env.SRC_DB_USER,
  password: process.env.SRC_DB_PASS,
  database: process.env.SRC_DB_NAME,
  port: +(process.env.SRC_DB_PORT || 3306),
  charset: "euckr",
  multipleStatements: false,
});
await src.query("SET NAMES euckr");

// Buffer → string 안전 디코드
function decode(val) {
  return Buffer.isBuffer(val) ? iconv.decode(val, "euc-kr") : (val ?? "");
}

// 전화번호 cell1+cell2+cell3 합치기
function formatPhone(c1, c2, c3) {
  const parts = [decode(c1), decode(c2), decode(c3)].map(s => String(s).trim()).filter(Boolean);
  return parts.join("-");
}

// "YYYY/MM/DD HH:mm:ss" → Date (비거나 잘못된 값이면 null)
function parseRegDate(v) {
  const s = decode(v).trim();
  if (!s) return null;
  // "2012/10/17 21:57:00" → "2012-10-17 21:57:00"
  const normalized = s.replace(/\//g, "-");
  const d = new Date(normalized);
  return isNaN(d.getTime()) ? null : d;
}

async function main() {
  console.log("Start PastUsers migration (member → PastUsers)...");

  const [rows] = await src.query(
    `SELECT id, name, cell1, cell2, cell3, address, email, reg_date
     FROM member`
  );

  console.log(`총 ${rows.length}건 읽음`);

  let ok = 0, fail = 0;
  for (const r of rows) {
    try {
      await prisma.pastUsers.create({
        data: {
          pastUserLoginId: decode(r.id).trim(),
          pastUserName: decode(r.name).trim(),
          pastUserPhoneNum: formatPhone(r.cell1, r.cell2, r.cell3),
          pastUserAddress: decode(r.address), // TEXT
          pastUserEmail: decode(r.email).trim(),
          pastUserJoinDate: parseRegDate(r.reg_date) ?? new Date(0), // null이면 Epoch(1970-01-01)로
        },
      });
      ok++;
    } catch (e) {
      fail++;
      console.error(`FAIL pastUser loginId=${decode(r.id)}`, e.message);
    }
  }

  console.log(`완료: 성공 ${ok} / 실패 ${fail}`);
  await prisma.$disconnect();
  await src.end();
}

main().catch(async (e) => {
  console.error(e);
  await prisma.$disconnect();
  await src.end();
  process.exit(1);
});

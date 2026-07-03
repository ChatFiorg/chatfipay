import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/firebaseAdmin";

function csvEscape(v: any): string {
  const s = v === null || v === undefined ? "" : String(v);
  return /[",\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
}

// GET /api/store/products/bulk?username=X&wallet=Y — export all products as CSV
export async function GET(req: NextRequest) {
  const { searchParams } = new URL(req.url);
  const username = searchParams.get("username");
  const wallet = searchParams.get("wallet");
  if (!username || !wallet) return NextResponse.json({ error: "Missing fields" }, { status: 400 });

  try {
    const storeSnap = await db.collection("stores").doc(username).get();
    if (!storeSnap.exists || storeSnap.data()!.ownerWallet !== wallet) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const snap = await db.collection("stores").doc(username).collection("products").get();
    const rows = ["id,name,description,price,stock,image,active"];
    snap.docs.forEach(d => {
      const p = d.data();
      rows.push(
        [d.id, p.name, p.description, p.price, p.stock, p.image, p.active]
          .map(csvEscape)
          .join(",")
      );
    });

    return new NextResponse(rows.join("\n"), {
      status: 200,
      headers: {
        "Content-Type": "text/csv",
        "Content-Disposition": `attachment; filename="${username}-products.csv"`,
      },
    });
  } catch (e: any) {
    console.error(e);
    return NextResponse.json({ error: "Server error" }, { status: 500 });
  }
}

// POST /api/store/products/bulk — bulk create/update products
// body: { username, ownerWallet, products: [{ id?, name, description?, price, stock?, image?, active? }] }
export async function POST(req: NextRequest) {
  try {
    const body = await req.json();
    const { username, ownerWallet, products } = body;
    if (!username || !ownerWallet || !Array.isArray(products)) {
      return NextResponse.json({ error: "Missing fields" }, { status: 400 });
    }

    const storeSnap = await db.collection("stores").doc(username).get();
    if (!storeSnap.exists || storeSnap.data()!.ownerWallet !== ownerWallet) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    let created = 0;
    let updated = 0;
    const errors: { row: number; error: string }[] = [];
    const colRef = db.collection("stores").doc(username).collection("products");

    for (let i = 0; i < products.length; i++) {
      const p = products[i];
      if (!p.name || p.price === undefined || p.price === "" || isNaN(Number(p.price))) {
        errors.push({ row: i + 1, error: "Missing or invalid name/price" });
        continue;
      }

      const isUpdate = !!p.id;
      const productId = p.id || colRef.doc().id;
      const activeVal = p.active === undefined || p.active === ""
        ? true
        : (p.active === true || String(p.active).toLowerCase() === "true");

      await colRef.doc(productId).set(
        {
          id: productId,
          name: String(p.name).trim(),
          description: p.description ? String(p.description).trim() : "",
          price: Number(p.price),
          stock: p.stock !== undefined && p.stock !== "" && p.stock !== null ? Number(p.stock) : null,
          image: p.image ? String(p.image).trim() : "",
          active: activeVal,
          updatedAt: new Date().toISOString(),
          ...(isUpdate ? {} : { createdAt: new Date().toISOString() }),
        },
        { merge: true }
      );

      if (isUpdate) updated++;
      else created++;
    }

    return NextResponse.json({ success: true, created, updated, errors });
  } catch (e: any) {
    console.error(e);
    return NextResponse.json({ error: e.message || "Server error" }, { status: 500 });
  }
}

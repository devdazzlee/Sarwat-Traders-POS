#!/bin/bash

# Script to check database connection and run migration

echo "🔍 Checking database connections..."
echo ""

# Check old database connection
echo "📊 Testing old database connection..."
OLD_DB_URL="${OLD_DATABASE_URL:-postgresql://user:password@host:port/dbname?sslmode=require}"

# Test connection using psql if available
if command -v psql &> /dev/null; then
    echo "Testing with psql..."
    PGPASSWORD=$(echo $OLD_DB_URL | grep -oP '://[^:]+:\K[^@]+') psql "$OLD_DB_URL" -c "SELECT 1;" 2>&1 | head -5
else
    echo "⚠️  psql not found. Testing with Node.js..."
    cd "$(dirname "$0")/.."
    npx ts-node -e "
        import { PrismaClient } from '@prisma/client';
        const db = new PrismaClient({ datasources: { db: { url: '$OLD_DB_URL' } } });
        db.\$connect()
            .then(async () => {
                console.log('✅ Old DB is reachable');
                const count = await db.user.count();
                console.log('Users found:', count);
                await db.\$disconnect();
                process.exit(0);
            })
            .catch((e) => {
                console.log('❌ Old DB not reachable:', e.message);
                console.log('');
                console.log('💡 Solutions:');
                console.log('1. Check Aiven dashboard - service might be paused');
                console.log('2. Get connection pooler URL from Aiven');
                console.log('3. Restart the database service in Aiven');
                process.exit(1);
            });
    "
fi

echo ""
echo "📊 Testing new database connection..."
NEW_DB_URL="${DATABASE_URL}"
if [ -z "$NEW_DB_URL" ]; then
    echo "❌ DATABASE_URL not set in .env"
    exit 1
fi

cd "$(dirname "$0")/.."
npx ts-node -e "
    import { PrismaClient } from '@prisma/client';
    const db = new PrismaClient({ datasources: { db: { url: '$NEW_DB_URL' } } });
    db.\$connect()
        .then(async () => {
            console.log('✅ New DB is reachable');
            await db.\$disconnect();
        })
        .catch((e) => {
            console.log('❌ New DB not reachable:', e.message);
            process.exit(1);
        });
"

echo ""
echo "🚀 If both connections work, run: npx ts-node scripts/migrate-data.ts"



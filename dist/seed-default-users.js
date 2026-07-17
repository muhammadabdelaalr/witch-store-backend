"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
const prisma_1 = require("./prisma");
async function main() {
    try {
        const companies = await prisma_1.prisma.company.findMany({
            include: {
                branches: true,
                users: true
            }
        });
        console.log('Checking default users for all companies...');
        for (const company of companies) {
            const userCount = company.users.length;
            console.log(`Company: ${company.name} (ID: ${company.id}) has ${userCount} user(s).`);
            if (userCount === 0) {
                const defaultBranch = company.branches.find(b => b.is_main) || company.branches[0];
                const branchId = defaultBranch?.id || null;
                console.log(`Seeding default users for Company: ${company.name} under Branch ID: ${branchId}`);
                // Seed Administrator
                await prisma_1.prisma.user.upsert({
                    where: {
                        company_id_name: {
                            company_id: company.id,
                            name: 'Administrator'
                        }
                    },
                    update: {},
                    create: {
                        company_id: company.id,
                        branch_id: branchId,
                        name: 'Administrator',
                        phone: 'admin',
                        logs: '[]'
                    }
                });
                // Seed admin
                await prisma_1.prisma.user.upsert({
                    where: {
                        company_id_name: {
                            company_id: company.id,
                            name: 'admin'
                        }
                    },
                    update: {},
                    create: {
                        company_id: company.id,
                        branch_id: branchId,
                        name: 'admin',
                        phone: 'admin',
                        logs: '[]'
                    }
                });
                console.log(`Successfully seeded default users for Company ID: ${company.id}`);
            }
        }
    }
    catch (err) {
        console.error('Error seeding default users:', err);
    }
    finally {
        await prisma_1.prisma.$disconnect();
    }
}
main();

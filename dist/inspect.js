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
        console.log('=== COMPANIES, BRANCHES, AND USERS ===');
        for (const c of companies) {
            console.log(`\nCompany ID: ${c.id}`);
            console.log(`Name: ${c.name}`);
            console.log(`Legal Name: ${c.legal_name}`);
            console.log(`Status: ${c.status}`);
            console.log('Branches:');
            c.branches.forEach(b => {
                console.log(`  - Branch ID: ${b.id}, Name: ${b.name}, is_main: ${b.is_main}`);
            });
            console.log('Users:');
            c.users.forEach(u => {
                console.log(`  - User ID: ${u.id}, Name: ${u.name}, Password/Phone: ${u.phone}`);
            });
        }
        const licenses = await prisma_1.prisma.license.findMany({
            include: {
                company: true
            }
        });
        console.log('\n=== LICENSES ===');
        for (const l of licenses) {
            console.log(`License ID: ${l.id}, Key: ${l.license_key}, Status: ${l.status}, Company: ${l.company.name}`);
        }
    }
    catch (err) {
        console.error('Error during inspection:', err);
    }
    finally {
        await prisma_1.prisma.$disconnect();
    }
}
main();

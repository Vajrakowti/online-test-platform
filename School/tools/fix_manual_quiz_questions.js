const fs = require('fs');
const path = require('path');

const dir = path.join(__dirname, '../manual-questions');

fs.readdirSync(dir).forEach(file => {
    if (file.endsWith('.json')) {
        const filePath = path.join(dir, file);
        let changed = false;
        let data = JSON.parse(fs.readFileSync(filePath, 'utf8'));
        if (Array.isArray(data)) {
            data.forEach(q => {
                if (typeof q.correctAnswer === 'number') {
                    q.correctAnswer = [q.correctAnswer];
                    changed = true;
                }
            });
            if (changed) {
                fs.writeFileSync(filePath, JSON.stringify(data, null, 2), 'utf8');
                console.log('Fixed:', filePath);
            }
        }
    }
});
console.log('Manual question fix complete.'); 
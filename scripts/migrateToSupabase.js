const fs = require('fs');
const path = require('path');
const csv = require('csv-parser');
const supabase = require('../src/utils/supabase');
const config = require('../src/config');

async function migrate() {
  console.log('🚀 Starting migration to Supabase...');
  
  const csvPath = path.resolve(__dirname, '..', config.outputFile);
  if (!fs.existsSync(csvPath)) {
    console.error('❌ CSV file not found at:', csvPath);
    return;
  }

  const leads = [];
  
  fs.createReadStream(csvPath)
    .pipe(csv())
    .on('data', (row) => {
      // Map CSV headers to database columns
      // Note: Supabase columns should ideally be snake_case or match exactly
      // We will create the table with columns matching these keys
      leads.push(row);
    })
    .on('end', async () => {
      console.log(`📊 Found ${leads.length} leads in CSV. Preparing to upload...`);
      
      if (leads.length === 0) {
        console.log('⚠️ No leads to migrate.');
        return;
      }

      // Batch upload leads to Supabase
      // We'll upload in chunks of 100 to avoid request size limits
      const chunkSize = 100;
      for (let i = 0; i < leads.length; i += chunkSize) {
        const chunk = leads.slice(i, i + chunkSize);
        console.log(`Sending chunk ${Math.floor(i/chunkSize) + 1}...`);
        
        const { error } = await supabase
          .from('leads')
          .insert(chunk);
          
        if (error) {
          console.error('❌ Error uploading chunk:', error.message);
          // If the table doesn't exist, we might need to explain how to create it
          if (error.code === '42P01') {
            console.error('💡 TIP: You need to create the "leads" table in the Supabase SQL Editor first.');
          }
          break;
        }
      }
      
      console.log('✅ Migration finished!');
    });
}

migrate();

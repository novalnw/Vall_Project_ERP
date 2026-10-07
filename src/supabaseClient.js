import { createClient } from '@supabase/supabase-js'

const supabaseUrl = 'https://guqikfnzoqqysitgqbhs.supabase.co'
const supabaseKey = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Imd1cWlrZm56b3FxeXNpdGdxYmhzIiwicm9sZSI6ImFub24iLCJpYXQiOjE3OTEzMjE5MDgsImV4cCI6MjEwNjg5NzkwOH0.fkXhszL6jMLybx64R87T71ANh8So5ZuC8Xn1dzS_rWY' // Ganti pakai anon key kamu

export const supabase = createClient(supabaseUrl, supabaseKey)
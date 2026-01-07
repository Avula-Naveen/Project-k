import { NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';

// Initialize Supabase client (PostgreSQL database)
const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
const supabaseKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

// Check if Supabase is configured
const isSupabaseConfigured = supabaseUrl && supabaseKey;

let supabase = null;
if (isSupabaseConfigured) {
  supabase = createClient(supabaseUrl, supabaseKey);
}

export async function POST(request) {
  try {
    const body = await request.json();
    const { name, email, phoneNumber, batchNumber, feedback, additionalText } = body;

    // Validate required fields
    if (!name || !email || !phoneNumber || !batchNumber || !feedback) {
      return NextResponse.json(
        { error: 'All required fields must be filled' },
        { status: 400 }
      );
    }

    // Validate email format
    const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
    if (!emailRegex.test(email)) {
      return NextResponse.json({ error: 'Invalid email format' }, { status: 400 });
    }

    // Format data for database (using snake_case for PostgreSQL/Supabase)
    const feedbackData = {
      name: name.trim(),
      email: email.trim(),
      phone_number: phoneNumber.trim(),
      batch_number: batchNumber.trim(),
      feedback: feedback.trim(),
      additional_text: additionalText?.trim() || '',
      submitted_at: new Date().toISOString(),
    };

    // Store in Supabase (PostgreSQL database)
    if (isSupabaseConfigured && supabase) {
      const { data, error } = await supabase
        .from('feedback')
        .insert([feedbackData])
        .select();

      if (error) {
        console.error('Supabase error:', error);
        return NextResponse.json(
          { error: 'Failed to save feedback to database', details: error.message },
          { status: 500 }
        );
      }

      return NextResponse.json(
        { message: 'Feedback submitted successfully', data },
        { status: 200 }
      );
    } else {
      // Fallback: Return error if Supabase is not configured
      return NextResponse.json(
        {
          error: 'Database not configured. Please set up Supabase.',
          details: 'Missing NEXT_PUBLIC_SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY in environment variables',
        },
        { status: 500 }
      );
    }
  } catch (error) {
    console.error('Feedback API error:', error);
    return NextResponse.json(
      { error: 'Internal server error' },
      { status: 500 }
    );
  }
}

// GET endpoint to retrieve feedback (for admin purposes)
export async function GET(request) {
  try {
    // Fetch from Supabase (PostgreSQL database)
    if (isSupabaseConfigured && supabase) {
      const { data, error } = await supabase
        .from('feedback')
        .select('*')
        .order('submitted_at', { ascending: false });

      if (error) {
        console.error('Supabase GET error:', error);
        return NextResponse.json(
          { error: 'Failed to fetch feedback', details: error.message },
          { status: 500 }
        );
      }

      return NextResponse.json(
        { feedbacks: data || [], storageType: 'PostgreSQL (Supabase)' },
        { status: 200 }
      );
    } else {
      // Return error if Supabase is not configured
      return NextResponse.json(
        {
          feedbacks: [],
          storageType: 'Not Configured',
          error: 'Database not configured. Please set up Supabase.',
        },
        { status: 200 }
      );
    }
  } catch (error) {
    console.error('Feedback GET error:', error);
    return NextResponse.json({ error: 'Internal server error', details: error.message }, { status: 500 });
  }
}


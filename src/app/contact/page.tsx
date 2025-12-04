'use client';

import Navbar from '@/components/shared/Navbar';
import { EnvelopeIcon, ChatBubbleLeftRightIcon, PaperAirplaneIcon, PhoneIcon } from '@heroicons/react/24/outline';

export default function ContactPage() {
  return (
    <div className="min-h-screen bg-gray-50 dark:bg-gray-900">
      <Navbar />
      <div className="container mx-auto px-4 py-8 pt-24 max-w-3xl">
        <div className="mb-8 text-center">
          <div className="flex justify-center mb-4">
            <div className="bg-indigo-100 dark:bg-indigo-900/30 rounded-full p-4">
              <ChatBubbleLeftRightIcon className="h-12 w-12 text-indigo-600 dark:text-indigo-400" />
            </div>
          </div>
          <h1 className="text-3xl font-bold text-gray-900 dark:text-gray-100 mb-2">
            Contact Developer
          </h1>
          <p className="text-gray-600 dark:text-gray-400">
            Have a question, found a bug, or have a feature request? Reach out directly via email or Telegram!
          </p>
        </div>

        {/* Direct Contact Options */}
        <div className="space-y-4">
          <a
            href="mailto:edwardgemadzi@rocketmail.com?subject=Leave Manager Inquiry"
            className="block p-6 bg-white dark:bg-gray-800 rounded-lg border-2 border-gray-200 dark:border-gray-700 hover:border-indigo-500 dark:hover:border-indigo-500 transition-all hover:shadow-lg group"
          >
            <div className="flex items-center gap-4">
              <div className="bg-indigo-100 dark:bg-indigo-900/30 rounded-full p-4 group-hover:bg-indigo-200 dark:group-hover:bg-indigo-900/50 transition-colors">
                <EnvelopeIcon className="h-8 w-8 text-indigo-600 dark:text-indigo-400" />
              </div>
              <div className="flex-1">
                <h3 className="text-lg font-semibold text-gray-900 dark:text-gray-100 mb-1 group-hover:text-indigo-600 dark:group-hover:text-indigo-400 transition-colors">
                  Send Email
                </h3>
                <p className="text-sm text-gray-500 dark:text-gray-400 mb-2">
                  Click to open your email client
                </p>
                <p className="text-base font-medium text-indigo-600 dark:text-indigo-400">
                  edwardgemadzi@rocketmail.com
                </p>
              </div>
              <PaperAirplaneIcon className="h-6 w-6 text-gray-400 group-hover:text-indigo-600 dark:group-hover:text-indigo-400 transition-colors" />
            </div>
          </a>

          <a
            href="https://t.me/edgemadzi"
            target="_blank"
            rel="noopener noreferrer"
            className="block p-6 bg-white dark:bg-gray-800 rounded-lg border-2 border-gray-200 dark:border-gray-700 hover:border-blue-500 dark:hover:border-blue-500 transition-all hover:shadow-lg group"
          >
            <div className="flex items-center gap-4">
              <div className="bg-blue-100 dark:bg-blue-900/30 rounded-full p-4 group-hover:bg-blue-200 dark:group-hover:bg-blue-900/50 transition-colors">
                <PhoneIcon className="h-8 w-8 text-blue-600 dark:text-blue-400" />
              </div>
              <div className="flex-1">
                <h3 className="text-lg font-semibold text-gray-900 dark:text-gray-100 mb-1 group-hover:text-blue-600 dark:group-hover:text-blue-400 transition-colors">
                  Message on Telegram
                </h3>
                <p className="text-sm text-gray-500 dark:text-gray-400 mb-2">
                  Click to open Telegram and start a conversation
                </p>
                <p className="text-base font-medium text-blue-600 dark:text-blue-400">
                  @edgemadzi
                </p>
              </div>
              <PaperAirplaneIcon className="h-6 w-6 text-gray-400 group-hover:text-blue-600 dark:group-hover:text-blue-400 transition-colors" />
            </div>
          </a>
        </div>

        {/* Info Section */}
        <div className="mt-8 bg-blue-50 dark:bg-blue-900/20 border border-blue-200 dark:border-blue-800 rounded-lg p-6">
          <div className="flex items-start">
            <EnvelopeIcon className="h-5 w-5 text-blue-600 dark:text-blue-400 mt-0.5 mr-3 flex-shrink-0" />
            <div className="text-sm text-blue-800 dark:text-blue-200">
              <p className="font-medium mb-1">Response Time</p>
              <p>We typically respond within 1-2 business days. For urgent issues, please contact your team leader.</p>
            </div>
          </div>
        </div>

        <div className="mt-6 text-center text-sm text-gray-500 dark:text-gray-400">
          <p>Choose your preferred contact method above to get in touch.</p>
        </div>
      </div>
    </div>
  );
}

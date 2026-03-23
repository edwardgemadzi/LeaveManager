import useSWR from 'swr';

const authedFetcher = async <T,>(url: string): Promise<T> => {
  const response = await fetch(url, {
    credentials: 'include',
  });
  if (!response.ok) {
    const error = await response.json().catch(() => ({}));
    throw new Error(error.error || `Request failed: ${response.status}`);
  }
  return response.json();
};

export const useAuthedSWR = <T,>(key: string | null) => {
  return useSWR<T>(key, authedFetcher, {
    revalidateOnFocus: false,
    dedupingInterval: 5000,
  });
};


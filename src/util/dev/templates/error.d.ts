interface Inputs {
  http_status_code: number;
  http_status_description: string;
  error_code?: string;
  now_id: string;
}

export default function(inputs: Inputs): string;

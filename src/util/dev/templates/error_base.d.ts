interface Inputs {
  http_status_code: number;
  http_status_description: string;
  view: string;
}

export default function(inputs: Inputs): string;

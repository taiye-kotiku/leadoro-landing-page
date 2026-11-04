const destinations = [
  "promisetaiye16@gmail.com",
  "kotikutaiye@gmail.com",
];

export default {
  async email(message) {
    const results = await Promise.allSettled(
      destinations.map((address) => message.forward(address)),
    );

    const failures = results.flatMap((result, index) =>
      result.status === "rejected"
        ? [{ address: destinations[index], error: String(result.reason) }]
        : [],
    );

    for (const failure of failures) {
      console.error(`Forwarding to ${failure.address} failed: ${failure.error}`);
    }

    if (failures.length === destinations.length) {
      message.setReject("Unable to forward this message to the configured destinations.");
    }
  },
};

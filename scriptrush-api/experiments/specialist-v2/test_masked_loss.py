import unittest
import torch
from kaggle_train import masked_causal_loss, assistant_logit_span


class MaskedLossTests(unittest.TestCase):
    def test_matches_reference_value_and_gradients(self):
        torch.manual_seed(23)
        reference = torch.randn(2, 9, 13, dtype=torch.float32, requires_grad=True)
        chunked = reference.detach().clone().requires_grad_()
        labels = torch.randint(0, 13, (2, 9))
        labels[:, :4] = -100
        labels[1, -2:] = -100
        expected = torch.nn.functional.cross_entropy(reference[:, :-1, :].reshape(-1, 13), labels[:, 1:].reshape(-1), ignore_index=-100)
        actual = masked_causal_loss(chunked, labels, chunk_size=3)
        torch.testing.assert_close(actual, expected)
        expected.backward()
        actual.backward()
        torch.testing.assert_close(chunked.grad, reference.grad)

    def test_rejects_no_target_tokens(self):
        with self.assertRaisesRegex(RuntimeError, "EMPTY_ASSISTANT_LABELS"):
            masked_causal_loss(torch.randn(1, 4, 9), torch.full((1, 4), -100))

    def test_assistant_only_head_matches_full_projection_value_and_gradients(self):
        for trailing_padding in (0, 2):
            torch.manual_seed(107)
            hidden = torch.randn(1, 14, 7, requires_grad=True)
            weight = torch.randn(23, 7, requires_grad=True)
            sliced_hidden = hidden.detach().clone().requires_grad_()
            sliced_weight = weight.detach().clone().requires_grad_()
            labels = torch.randint(0, 23, (1, 14))
            labels[:, :9] = -100
            if trailing_padding:
                labels[:, -trailing_padding:] = -100
            expected = masked_causal_loss(torch.nn.functional.linear(hidden, weight), labels, chunk_size=2)
            span = assistant_logit_span(labels)
            actual = masked_causal_loss(torch.nn.functional.linear(sliced_hidden[:, -span:, :], sliced_weight), labels[:, -span:], chunk_size=2)
            torch.testing.assert_close(actual, expected)
            expected.backward()
            actual.backward()
            torch.testing.assert_close(sliced_hidden.grad, hidden.grad)
            torch.testing.assert_close(sliced_weight.grad, weight.grad)

    def test_assistant_head_rejects_ambiguous_batch_or_unpredictable_alignment(self):
        for labels in (torch.tensor([[-100, 1], [-100, 2]]), torch.tensor([[1, 2]]), torch.tensor([[-100, -100]])):
            with self.assertRaises(RuntimeError):
                assistant_logit_span(labels)


if __name__ == "__main__":
    unittest.main()
